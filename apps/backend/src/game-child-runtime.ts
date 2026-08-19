import { Effect, Ref } from "effect";
import type { GameChildPhase } from "./game-child-model.ts";
import { initialGameChildState } from "./game-child-model.ts";
import { protocolIngest } from "./game-child-protocol.ts";
import type { TcpFrame } from "./framing.ts";

export type GameChildRuntimeService = {
  readonly phase: Effect.Effect<GameChildPhase>;
  readonly shouldClose: Effect.Effect<boolean>;
  readonly connect: () => Effect.Effect<void>;
  readonly ingest: (frame: TcpFrame) => Effect.Effect<ReadonlyArray<TcpFrame>>;
  readonly tick: () => Effect.Effect<ReadonlyArray<TcpFrame>>;
  readonly disconnect: () => Effect.Effect<void>;
};

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

    const tick = Effect.fn("GameChildRuntime.tick")(function* () {
      yield* Ref.update(stateRef, (state) => ({ ...state, tick: state.tick + 1 }));
      const frames: ReadonlyArray<TcpFrame> = [];
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
        yield* Ref.update(stateRef, (current) => ({ ...current, phase: result.nextPhase! }));
      }
      return result.action.frames;
    });

    return {
      phase,
      shouldClose,
      connect,
      ingest,
      tick,
      disconnect,
    } satisfies GameChildRuntimeService;
  });
}
