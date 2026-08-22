import { Effect, Match, Ref } from "effect";
import type { GameChildPhase, EntityState } from "./game-child-model.ts";
import {
  TICK_FRAME_MS,
  entitiesFromMatch,
  initialGameChildState,
  KO_DAMAGE,
  PLAYER_ENTITY_ID,
  shouldBeginFight,
  trackClientSimTick,
  fightStartTickFrom,
  type GameChildState,
} from "./game-child-model.ts";
import {
  advanceTickAndBuildSync,
  buildFightStartSync,
  queueMoveInput,
  syncStateToInputTick,
  type GameInput,
  type MoveInput,
} from "./game-input.ts";
import { protocolIngest } from "./game-child-protocol.ts";
import {
  logGameplayEvent,
  recordUnknownGamePacket,
  resetGameplayLogBudget,
} from "./game-observe.ts";
import { ingestUdpDatagram, ingestUdpTunnel } from "./game-udp-tunnel.ts";
import { STUB_USER_ID } from "./login-accepted.ts";
import { MatchSetupSpec } from "./match-spec.ts";
import type { TcpFrame } from "./framing.ts";
import { PacketType } from "./packets.ts";
import {
  buildMatchOverSync,
  buildPlayerDisconnectSync,
  buildPlayerReconnectSync,
  buildRespawnSync,
} from "./game-sync.ts";
import { humanPlayerCount } from "./match-players.ts";

type GameConnection = {
  readonly userId: number;
  readonly quitAcknowledged: boolean;
};

export type GameChildRuntimeService = {
  readonly phase: Effect.Effect<GameChildPhase>;
  readonly state: Effect.Effect<GameChildState>;
  /** @deprecated use shouldCloseConnection */
  readonly shouldClose: Effect.Effect<boolean>;
  readonly shouldShutdown: Effect.Effect<boolean>;
  readonly shouldCloseConnection: (connectionId: number) => Effect.Effect<boolean>;
  readonly registerConnection: (connectionId: number, userId: number) => Effect.Effect<void>;
  readonly unregisterConnection: (connectionId: number) => Effect.Effect<void>;
  readonly connect: () => Effect.Effect<void>;
  readonly ingest: (
    frame: TcpFrame,
    connectionId: number,
  ) => Effect.Effect<ReadonlyArray<TcpFrame>>;
  readonly ingestUdp: (payload: Uint8Array) => Effect.Effect<Uint8Array | undefined>;
  readonly drainPendingTcp: (connectionId: number) => Effect.Effect<ReadonlyArray<TcpFrame>>;
  readonly applyInput: (input: GameInput) => Effect.Effect<void>;
  readonly tick: () => Effect.Effect<ReadonlyArray<TcpFrame>>;
  readonly forceState: (state: GameChildState) => Effect.Effect<void>;
  readonly disconnect: () => Effect.Effect<void>;
};

const defaultEntities = (
  includeBot: boolean,
  userId: number,
  setup?: MatchSetupSpec,
): ReadonlyArray<EntityState> =>
  entitiesFromMatch({
    userId,
    includeBot,
    guests: setup?.guests,
    bots: setup?.bots,
  });

type KoTransition = {
  readonly state: GameChildState;
  readonly frames: ReadonlyArray<TcpFrame>;
  readonly shouldClose: boolean;
};

const applyKoRules = (state: GameChildState): KoTransition => {
  const koEntity = state.entities.find((entity) => entity.damage >= KO_DAMAGE);
  if (koEntity === undefined) {
    return { state, frames: [], shouldClose: false };
  }

  const nextEntities = state.entities.map((entity) => {
    if (entity.entityId !== koEntity.entityId) return entity;
    const nextStocks = Math.max(0, entity.stocks - 1);
    if (nextStocks === 0) {
      return { ...entity, stocks: 0, damage: 0, x: 0, y: 0 };
    }
    return { ...entity, stocks: nextStocks, damage: 0, x: 0, y: 0 };
  });

  const playerLostFinalStock =
    koEntity.entityId === PLAYER_ENTITY_ID &&
    nextEntities.some((entity) => entity.entityId === PLAYER_ENTITY_ID && entity.stocks === 0);

  if (playerLostFinalStock) {
    const matchOverState: GameChildState = {
      ...state,
      phase: "matchOver",
      entities: nextEntities,
    };
    return {
      state: matchOverState,
      frames: buildMatchOverSync(matchOverState),
      shouldClose: true,
    };
  }

  const respawnState: GameChildState = {
    ...state,
    entities: nextEntities,
  };
  return {
    state: respawnState,
    frames: buildRespawnSync(respawnState, koEntity.entityId),
    shouldClose: false,
  };
};

const beginFightTickLoop = (state: GameChildState, now: number) => {
  const tick = fightStartTickFrom(state);
  return {
    state: {
      ...state,
      simReady: true,
      tick,
      lastTickAdvanceAtMs: now,
    },
    // 10312 entitySpawn at fight start was REJECTED: client jumps straight to results.
    frames: buildFightStartSync(state),
  };
};

const logMoveInputs = (prefix: string, inputs: ReadonlyArray<GameInput>) =>
  Effect.gen(function* () {
    for (const input of inputs) {
      if (input._tag !== "Move") continue;
      if (input.input === 0) continue;
      yield* logGameplayEvent(
        `${prefix} entity=${input.entityId} mask=${input.input} tick=${input.tick}`,
      );
    }
  });

export class GameChildRuntime {
  static make = Effect.fn("GameChildRuntime.make")(function* (args: {
    readonly includeBot: boolean;
    readonly userId?: number;
    readonly token?: string;
    readonly levelId?: number;
    readonly setup?: MatchSetupSpec;
  }) {
    const userId = args.userId ?? STUB_USER_ID;
    const setup = args.setup ?? MatchSetupSpec.default;
    const stateRef = yield* Ref.make({
      ...initialGameChildState(args.includeBot, {
        userId,
        guests: setup.guests,
        bots: setup.bots,
      }),
      udpSessionId: userId,
    });
    const closedConnectionsRef = yield* Ref.make<ReadonlySet<number>>(new Set());
    const shutdownRef = yield* Ref.make(false);
    const connectionsRef = yield* Ref.make<ReadonlyMap<number, GameConnection>>(new Map());
    const pendingTcpRef = yield* Ref.make<ReadonlyMap<number, ReadonlyArray<TcpFrame>>>(new Map());
    const humansInMatch = humanPlayerCount(setup);
    const spec = {
      userId,
      token: args.token ?? "",
      levelId: args.levelId ?? 1,
      includeBot: args.includeBot,
      setup,
    };

    const phase = Ref.get(stateRef).pipe(Effect.map((state) => state.phase));
    const state = Ref.get(stateRef);
    const forceState = (next: GameChildState) => Ref.set(stateRef, next);
    const shouldClose = Effect.gen(function* () {
      const closed = yield* Ref.get(closedConnectionsRef);
      return closed.size > 0;
    });
    const shouldShutdown = Ref.get(shutdownRef);
    const shouldCloseConnection = (connectionId: number) =>
      Ref.get(closedConnectionsRef).pipe(Effect.map((closed) => closed.has(connectionId)));

    const closeConnection = (connectionId: number) =>
      Ref.update(closedConnectionsRef, (closed) => new Set([...closed, connectionId]));

    const activeConnectionCount = Effect.gen(function* () {
      const connections = yield* Ref.get(connectionsRef);
      const closed = yield* Ref.get(closedConnectionsRef);
      let count = 0;
      for (const id of connections.keys()) {
        if (!closed.has(id)) count += 1;
      }
      return count;
    });

    const queuePendingTcp = (connectionId: number, frames: ReadonlyArray<TcpFrame>) =>
      Ref.update(pendingTcpRef, (pending) => {
        const next = new Map(pending);
        next.set(connectionId, [...(next.get(connectionId) ?? []), ...frames]);
        return next;
      });

    const broadcastExcept = Effect.fn("GameChildRuntime.broadcastExcept")(function* (
      exceptConnectionId: number,
      frames: ReadonlyArray<TcpFrame>,
    ) {
      if (frames.length === 0) return;
      const connections = yield* Ref.get(connectionsRef);
      const closed = yield* Ref.get(closedConnectionsRef);
      for (const [connectionId] of connections) {
        if (connectionId === exceptConnectionId || closed.has(connectionId)) continue;
        yield* queuePendingTcp(connectionId, frames);
      }
    });

    const maybeShutdownIfIdle = Effect.fn("GameChildRuntime.maybeShutdownIfIdle")(function* () {
      const active = yield* activeConnectionCount;
      if (active > 0) return;
      yield* Ref.set(shutdownRef, true);
    });

    const markPlayerQuit = Effect.fn("GameChildRuntime.markPlayerQuit")(function* (
      userId: number,
      connectionId: number,
    ) {
      yield* Ref.update(stateRef, (state) => ({
        ...state,
        phase: "matchOver" as const,
        simReady: false,
        disconnectedUserIds: state.disconnectedUserIds.includes(userId)
          ? state.disconnectedUserIds
          : [...state.disconnectedUserIds, userId],
      }));
      yield* Ref.update(connectionsRef, (connections) => {
        const current = connections.get(connectionId);
        if (current === undefined) return connections;
        const next = new Map(connections);
        next.set(connectionId, { ...current, quitAcknowledged: true });
        return next;
      });
      if (humansInMatch > 1) {
        yield* broadcastExcept(connectionId, buildPlayerDisconnectSync(userId));
      }
    });

    const registerConnection = Effect.fn("GameChildRuntime.registerConnection")(function* (
      connectionId: number,
      connectionUserId: number,
    ) {
      yield* Ref.update(connectionsRef, (connections) => {
        const next = new Map(connections);
        next.set(connectionId, { userId: connectionUserId, quitAcknowledged: false });
        return next;
      });
    });

    const unregisterConnection = Effect.fn("GameChildRuntime.unregisterConnection")(function* (
      connectionId: number,
    ) {
      const connection = (yield* Ref.get(connectionsRef)).get(connectionId);
      yield* Ref.update(connectionsRef, (connections) => {
        const next = new Map(connections);
        next.delete(connectionId);
        return next;
      });
      yield* closeConnection(connectionId);
      if (
        connection !== undefined &&
        !connection.quitAcknowledged &&
        (yield* Ref.get(stateRef)).phase === "activeMatch"
      ) {
        yield* Ref.update(stateRef, (state) => ({
          ...state,
          disconnectedUserIds: state.disconnectedUserIds.includes(connection.userId)
            ? state.disconnectedUserIds
            : [...state.disconnectedUserIds, connection.userId],
        }));
        if (humansInMatch > 1) {
          yield* broadcastExcept(connectionId, buildPlayerDisconnectSync(connection.userId));
        }
      }
      yield* maybeShutdownIfIdle();
    });

    const drainPendingTcp = Effect.fn("GameChildRuntime.drainPendingTcp")(function* (
      connectionId: number,
    ) {
      const pending = yield* Ref.get(pendingTcpRef);
      const frames = pending.get(connectionId) ?? [];
      yield* Ref.update(pendingTcpRef, (current) => {
        const next = new Map(current);
        next.delete(connectionId);
        return next;
      });
      return frames;
    });

    const disconnect = Effect.fn("GameChildRuntime.disconnect")(function* () {
      yield* closeConnection(0);
      yield* Ref.update(stateRef, (state) => ({ ...state, connected: false }));
    });

    const connect = Effect.fn("GameChildRuntime.connect")(function* () {
      yield* Ref.update(stateRef, (state) =>
        state.phase === "waitingForConnect"
          ? { ...state, connected: true, phase: "syncingIntoMatch" as const }
          : state,
      );
    });

    const applyInput = Effect.fn("GameChildRuntime.applyInput")(function* (input: GameInput) {
      yield* Ref.update(stateRef, (state) => {
        if (state.phase !== "activeMatch") return state;
        return Match.valueTags(input, {
          SimReady: () => ({
            ...state,
            entities:
              state.entities.length > 0
                ? state.entities
                : defaultEntities(state.includeBot, spec.userId, spec.setup),
          }),
          TickAck: (ack) => ({ ...state, clientTick: ack.clientTick }),
          Move: (move) =>
            trackClientSimTick(
              queueMoveInput(state, {
                entityId: move.entityId,
                tick: move.tick,
                input: move.input,
              }),
              move.tick,
            ),
          UnknownInput: () => state,
        });
      });
    });

    const emitInputSync = Effect.fn("GameChildRuntime.emitInputSync")(function* (
      inputs: ReadonlyArray<GameInput>,
    ) {
      const moves = inputs.filter((input): input is MoveInput => input._tag === "Move");
      if (moves.length === 0) return;
      const state = yield* Ref.get(stateRef);
      if (!state.simReady) return;
      const targetTick = Math.max(...moves.map((move) => move.tick));
      const sync = syncStateToInputTick(state, targetTick);
      if (sync.frames.length === 0) return;
      yield* Ref.set(stateRef, sync.state);
      yield* queuePendingTcp(0, sync.frames);
    });

    const tick = Effect.fn("GameChildRuntime.tick")(function* () {
      const state = yield* Ref.get(stateRef);
      if (state.phase !== "activeMatch") {
        return [];
      }

      const transition = applyKoRules(state);
      if (transition.frames.length > 0) {
        yield* Ref.set(stateRef, transition.state);
        return transition.frames;
      }

      const now = Date.now();
      if (!state.simReady) {
        if (!shouldBeginFight(state, now)) {
          return [];
        }
        const sync = beginFightTickLoop(state, now);
        yield* Ref.set(stateRef, sync.state);
        yield* logGameplayEvent(
          `fight start tick=${sync.state.tick} (10404) clientSim=${state.clientSimTick}`,
        );
        return sync.frames;
      }

      if (now - state.lastTickAdvanceAtMs < TICK_FRAME_MS) {
        const lag = state.clientSimTick - state.tick;
        if (lag <= TICK_FRAME_MS) {
          return [];
        }
      }

      const sync = advanceTickAndBuildSync(state);
      if (sync.frames.length === 0) {
        return [];
      }
      yield* Ref.set(stateRef, { ...sync.state, lastTickAdvanceAtMs: now });
      return sync.frames;
    });

    const ingest = Effect.fn("GameChildRuntime.ingest")(function* (
      frame: TcpFrame,
      connectionId: number,
    ) {
      const state = yield* Ref.get(stateRef);
      const connection = (yield* Ref.get(connectionsRef)).get(connectionId);
      const connectionUserId = connection?.userId ?? spec.userId;
      if (
        (state.phase === "activeMatch" || state.phase === "matchOver") &&
        frame.type === PacketType.udpTunnel
      ) {
        const tunnelResult = ingestUdpTunnel(frame.payload, state);
        if (tunnelResult !== undefined) {
          const entities =
            tunnelResult.state.entities.length > 0
              ? tunnelResult.state.entities
              : defaultEntities(state.includeBot, spec.userId, spec.setup);
          yield* Ref.set(stateRef, { ...tunnelResult.state, entities });
          yield* logMoveInputs("10316", tunnelResult.inputs);
          yield* emitInputSync(tunnelResult.inputs);
          return tunnelResult.frames;
        }
      }
      if (state.phase === "activeMatch" && frame.type === PacketType.tickPulse) {
        return [];
      }
      const result = protocolIngest(frame, spec, state, connectionUserId);
      if (result.quitUserId !== undefined) {
        yield* markPlayerQuit(result.quitUserId, connectionId);
      }
      if (result.reconnectUserId !== undefined) {
        yield* Ref.update(stateRef, (current) => ({
          ...current,
          disconnectedUserIds: current.disconnectedUserIds.filter(
            (id) => id !== result.reconnectUserId,
          ),
        }));
        yield* broadcastExcept(connectionId, buildPlayerReconnectSync(result.reconnectUserId));
      }
      if (result.shouldClose) {
        yield* closeConnection(connectionId);
      }
      if (result.action._tag === "Close") {
        yield* disconnect();
        return [];
      }
      if (result.nextPhase !== undefined) {
        yield* Ref.update(stateRef, (current) => ({
          ...current,
          phase: result.nextPhase!,
          enteredActiveMatchAtMs:
            result.nextPhase === "activeMatch" ? Date.now() : current.enteredActiveMatchAtMs,
          entities:
            current.entities.length > 0
              ? current.entities
              : defaultEntities(current.includeBot, spec.userId, spec.setup),
        }));
        if (result.nextPhase === "activeMatch") {
          resetGameplayLogBudget();
        }
      }
      if (result.introSync) {
        yield* Ref.update(stateRef, (current) => {
          const next = { ...current, lastIntroSyncAtMs: Date.now() };
          return result.introClientSimTick !== undefined
            ? trackClientSimTick(next, result.introClientSimTick)
            : next;
        });
        return [];
      }
      if (result.input !== undefined) {
        yield* applyInput(result.input);
        if (result.input._tag === "Move") {
          yield* logMoveInputs("10407", [result.input]);
        }
      }
      if (result.unknownGameplay !== undefined) {
        yield* recordUnknownGamePacket({
          dir: "client",
          type: result.unknownGameplay.type,
          payload: result.unknownGameplay.payload,
        });
      }
      return result.action.frames;
    });

    const ingestUdp = Effect.fn("GameChildRuntime.ingestUdp")(function* (payload: Uint8Array) {
      const state = yield* Ref.get(stateRef);
      if (state.phase !== "activeMatch" && state.phase !== "matchOver") return undefined;
      const result = ingestUdpDatagram(payload, state);
      if (result === undefined) {
        yield* logGameplayEvent(`UDP decode failed ${payload.length}b`);
        return undefined;
      }
      const entities =
        result.state.entities.length > 0
          ? result.state.entities
          : defaultEntities(state.includeBot, spec.userId, spec.setup);
      yield* Ref.set(stateRef, { ...result.state, entities });
      yield* logMoveInputs("UDP", result.inputs);
      yield* emitInputSync(result.inputs);
      return result.reply;
    });

    return {
      phase,
      state,
      shouldClose,
      shouldShutdown,
      shouldCloseConnection,
      registerConnection,
      unregisterConnection,
      connect,
      ingest,
      ingestUdp,
      drainPendingTcp,
      applyInput,
      tick,
      forceState,
      disconnect,
    } satisfies GameChildRuntimeService;
  });
}
