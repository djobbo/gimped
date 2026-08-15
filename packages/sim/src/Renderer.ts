import { Context, Effect, Layer } from "effect";
import type { Snapshot } from "./domain.ts";

export class Renderer extends Context.Service<
  Renderer,
  {
    readonly present: (snapshot: Snapshot) => Effect.Effect<void>;
  }
>()("@gimped/sim/Renderer") {
  static readonly layer = Layer.succeed(
    Renderer,
    Renderer.of({
      present: Effect.fn("Renderer.present")((_snapshot: Snapshot) => Effect.void),
    }),
  );
}
