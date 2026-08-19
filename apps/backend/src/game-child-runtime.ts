import { Effect, Ref } from "effect";
import type { GameChildPhase, EntityState } from "./game-child-model.ts";
import { initialGameChildState } from "./game-child-model.ts";
import { encodeEntityValue, encodeTickPulse, type GameInput } from "./game-input.ts";
import { protocolIngest } from "./game-child-protocol.ts";
import { recordUnknownGamePacket } from "./game-observe.ts";
import { STUB_USER_ID } from "./login-accepted.ts";
import type { TcpFrame } from "./framing.ts";
import { PacketType } from "./packets.ts";

export type GameChildRuntimeService = {
  readonly phase: Effect.Effect<GameChildPhase>;
  readonly shouldClose: Effect.Effect<boolean>;
  readonly connect: () => Effect.Effect<void>;
  readonly ingest: (frame: TcpFrame) => Effect.Effect<ReadonlyArray<TcpFrame>>;
  readonly applyInput: (input: GameInput) => Effect.Effect<void>;
  readonly tick: () => Effect.Effect<ReadonlyArray<TcpFrame>>;
  readonly disconnect: () => Effect.Effect<void>;
};

const defaultEntities = (includeBot: boolean): ReadonlyArray<EntityState> => {
  const entities: EntityState[] = [
    {
      entityId: 1,
      userId: STUB_USER_ID,
      stocks: 3,
      damage: 0,
      x: 0,
      y: 0,
    },
  ];
  if (includeBot) {
    entities.push({
      entityId: 2,
      userId: 0,
      stocks: 3,
      damage: 0,
      x: 0,
      y: 0,
    });
  }
  return entities;
};

const updateEntity = (
  entities: ReadonlyArray<EntityState>,
  entityId: number,
  update: Partial<Pick<EntityState, "x" | "y" | "damage" | "stocks">>,
): ReadonlyArray<EntityState> =>
  entities.map((entity) => (entity.entityId === entityId ? { ...entity, ...update } : entity));

export class GameChildRuntime {
  static make = Effect.fn("GameChildRuntime.make")(function* (args: {
    readonly includeBot: boolean;
    readonly userId?: number;
    readonly token?: string;
  }) {
    const stateRef = yield* Ref.make(initialGameChildState(args.includeBot));
    const closedRef = yield* Ref.make(false);
    const spec = {
      userId: args.userId ?? 0,
      token: args.token ?? "",
      includeBot: args.includeBot,
    };

    const phase = Ref.get(stateRef).pipe(Effect.map((state) => state.phase));
    const shouldClose = Ref.get(closedRef);

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
              simReady: true,
              entities:
                state.entities.length > 0 ? state.entities : defaultEntities(state.includeBot),
            };
          case "TickAck":
            return { ...state, clientTick: input.clientTick };
          case "Move":
            return {
              ...state,
              entities:
                state.entities.length > 0
                  ? updateEntity(state.entities, input.entityId, { x: input.x, y: input.y })
                  : defaultEntities(state.includeBot),
            };
          default:
            return state;
        }
      });
    });

    const tick = Effect.fn("GameChildRuntime.tick")(function* () {
      const state = yield* Ref.get(stateRef);
      if (state.phase !== "activeMatch" || !state.simReady) {
        return [];
      }
      const nextTick = state.tick + 1;
      yield* Ref.update(stateRef, (current) => ({ ...current, tick: nextTick }));
      const frames: TcpFrame[] = [
        {
          type: PacketType.tickPulse,
          seq: undefined,
          payload: encodeTickPulse(nextTick),
        },
      ];
      for (const entity of state.entities) {
        frames.push({
          type: PacketType.entityValue,
          seq: undefined,
          payload: encodeEntityValue(entity.entityId, entity.x),
        });
      }
      return frames;
    });

    const ingest = Effect.fn("GameChildRuntime.ingest")(function* (frame: TcpFrame) {
      const state = yield* Ref.get(stateRef);
      const result = protocolIngest(frame, spec, state);
      if (result.action._tag === "Close") {
        yield* disconnect();
        return [];
      }
      if (result.nextPhase !== undefined) {
        yield* Ref.update(stateRef, (current) => ({
          ...current,
          phase: result.nextPhase!,
          entities:
            current.entities.length > 0 ? current.entities : defaultEntities(current.includeBot),
        }));
      }
      if (result.input !== undefined) {
        yield* applyInput(result.input);
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

    return {
      phase,
      shouldClose,
      connect,
      ingest,
      applyInput,
      tick,
      disconnect,
    } satisfies GameChildRuntimeService;
  });
}
