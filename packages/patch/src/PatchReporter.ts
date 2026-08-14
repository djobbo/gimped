import { Context, Effect, Layer } from "effect";
import type { PatchEvent } from "./schemas.ts";

export class PatchReporter extends Context.Service<
  PatchReporter,
  {
    readonly emit: (event: PatchEvent) => Effect.Effect<void>;
  }
>()("@gimped/patch/PatchReporter") {
  static readonly noop: Layer.Layer<PatchReporter> = Layer.succeed(PatchReporter, {
    emit: (_event) => Effect.void,
  });
}
