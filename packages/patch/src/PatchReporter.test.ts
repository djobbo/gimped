import { expect, it } from "@effect/vitest";
import { Effect, Ref } from "effect";
import { PatchReporter } from "./PatchReporter.ts";

it.effect("collecting reporter records emits", () =>
  Effect.gen(function* () {
    const { layer, events } = yield* PatchReporter.collecting();
    yield* PatchReporter.pipe(
      Effect.flatMap((reporter) => reporter.emit({ _tag: "StepStarted", step: "DownloadDepot" })),
      Effect.provide(layer),
    );
    expect(yield* Ref.get(events)).toEqual([{ _tag: "StepStarted", step: "DownloadDepot" }]);
  }),
);
