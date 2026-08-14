import { Context, Effect, Layer, Ref } from "effect";
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

  static collecting(): Effect.Effect<{
    readonly layer: Layer.Layer<PatchReporter>;
    readonly events: Ref.Ref<ReadonlyArray<PatchEvent>>;
  }> {
    return Effect.gen(function* () {
      const events = yield* Ref.make<ReadonlyArray<PatchEvent>>([]);
      const layer = Layer.succeed(PatchReporter, {
        emit: (event) => Ref.update(events, (current) => [...current, event]),
      });
      return { layer, events };
    });
  }
}
