import { Effect } from "effect";
import { encodeFrame } from "./framing.ts";
import type { GameChildRuntimeService } from "./game-child-runtime.ts";

export const runGameChildLoop = Effect.fn("runGameChildLoop")(function* (
  runtime: GameChildRuntimeService,
  write: (bytes: Uint8Array) => Effect.Effect<void>,
) {
  while (!(yield* runtime.shouldClose)) {
    const frames = yield* runtime.tick();
    yield* Effect.forEach(frames, (frame) => write(encodeFrame(frame)));
    yield* Effect.sleep("16 millis");
  }
});
