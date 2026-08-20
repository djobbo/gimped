import { Effect, Ref } from "effect";
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
import { buildMatchOverSync, buildRespawnSync } from "./game-sync.ts";

export type GameChildRuntimeService = {
  readonly phase: Effect.Effect<GameChildPhase>;
  readonly state: Effect.Effect<GameChildState>;
  readonly shouldClose: Effect.Effect<boolean>;
  readonly connect: () => Effect.Effect<void>;
  readonly ingest: (frame: TcpFrame) => Effect.Effect<ReadonlyArray<TcpFrame>>;
  readonly ingestUdp: (payload: Uint8Array) => Effect.Effect<Uint8Array | undefined>;
  readonly drainPendingTcp: () => Effect.Effect<ReadonlyArray<TcpFrame>>;
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
    // 10312 entitySpawn at fight start was REJECTED: client jumps straight to results
    // (protocol: entitySpawn drives match UI reset; matchOver also uses it).
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
    const closedRef = yield* Ref.make(false);
    const pendingTcpRef = yield* Ref.make<ReadonlyArray<TcpFrame>>([]);
    const spec = {
      userId,
      token: args.token ?? "",
      includeBot: args.includeBot,
      setup,
    };

    const phase = Ref.get(stateRef).pipe(Effect.map((state) => state.phase));
    const state = Ref.get(stateRef);
    const shouldClose = Ref.get(closedRef);
    const forceState = (state: GameChildState) => Ref.set(stateRef, state);

    const drainPendingTcp = Effect.fn("GameChildRuntime.drainPendingTcp")(function* () {
      return yield* Ref.getAndSet(pendingTcpRef, []);
    });

    const disconnect = Effect.fn("GameChildRuntime.disconnect")(function* () {
      yield* Ref.set(closedRef, true);
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
        switch (input._tag) {
          case "SimReady":
            return {
              ...state,
              entities:
                state.entities.length > 0
                  ? state.entities
                  : defaultEntities(state.includeBot, spec.userId, spec.setup),
            };
          case "TickAck":
            return { ...state, clientTick: input.clientTick };
          case "Move":
            return trackClientSimTick(
              queueMoveInput(state, {
                entityId: input.entityId,
                tick: input.tick,
                input: input.input,
              }),
              input.tick,
            );
          default:
            return state;
        }
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
      yield* Ref.update(pendingTcpRef, (pending) => [...pending, ...sync.frames]);
    });

    const tick = Effect.fn("GameChildRuntime.tick")(function* () {
      const state = yield* Ref.get(stateRef);
      if (state.phase !== "activeMatch") {
        return [];
      }

      const transition = applyKoRules(state);
      if (transition.frames.length > 0 || transition.shouldClose) {
        yield* Ref.set(stateRef, transition.state);
        if (transition.shouldClose) {
          yield* Ref.set(closedRef, true);
        }
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

    const ingest = Effect.fn("GameChildRuntime.ingest")(function* (frame: TcpFrame) {
      const state = yield* Ref.get(stateRef);
      if (state.phase === "activeMatch" && frame.type === PacketType.udpTunnel) {
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
      const result = protocolIngest(frame, spec, state);
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
      if (state.phase !== "activeMatch") return undefined;
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
