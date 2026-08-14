import { expect, it } from "@effect/vitest";
import { Effect, Layer, Ref } from "effect";
import { PatchReporter } from "./PatchReporter.ts";
import type { PatchEvent } from "./schemas.ts";

it.effect("collecting reporter records emits", () =>
  Effect.gen(function* () {
    const events = yield* Ref.make<ReadonlyArray<PatchEvent>>([]);
    const layer = Layer.succeed(PatchReporter, {
      emit: (event) => Ref.update(events, (current) => [...current, event]),
    });
    yield* PatchReporter.pipe(
      Effect.flatMap((reporter) => reporter.emit({ _tag: "StepStarted", step: "DownloadDepot" })),
      Effect.provide(layer),
    );
    expect(yield* Ref.get(events)).toEqual([{ _tag: "StepStarted", step: "DownloadDepot" }]);
  }),
);
