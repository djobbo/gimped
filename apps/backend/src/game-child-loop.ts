import { Effect, Ref } from "effect";
import { encodeFrame } from "./framing.ts";
import type { GameChildRuntimeService } from "./game-child-runtime.ts";

export const runGameChildLoop = Effect.fn("runGameChildLoop")(function* (
  runtime: GameChildRuntimeService,
  tcpWriteRef: Ref.Ref<ReadonlyMap<number, (bytes: Uint8Array) => Effect.Effect<void>>>,
) {
  while (!(yield* runtime.shouldShutdown)) {
    const frames = yield* runtime.tick();
    if (frames.length > 0) {
      const writers = yield* Ref.get(tcpWriteRef);
      for (const write of writers.values()) {
        yield* Effect.forEach(frames, (frame) => write(encodeFrame(frame)));
      }
    }
    yield* Effect.sleep("16 millis");
  }
});
