import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Ref } from "effect";
import { BuildIdNotFound, KeyNotFound } from "./errors.ts";
import { KeyExtractor } from "./KeyExtractor.ts";
import { PatchReporter } from "./PatchReporter.ts";

const AppLive = KeyExtractor.layer.pipe(
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(PatchReporter.noop),
);

const writeAs = Effect.fn("writeAs")(function* (dir: string, relative: string, body: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const filePath = path.join(dir, relative);
  yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
  yield* fs.writeFileString(filePath, body);
});

layer(AppLive)("KeyExtractor", (it) => {
  it.effect("reads Init key and vs-quoted build id", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const extractor = yield* KeyExtractor;
      const dir = yield* fs.makeTempDirectory({ prefix: "key-ex-" });
      yield* writeAs(dir, "class_316.as", "ANE_RawData.Init(762411009);\n");
      yield* writeAs(
        dir,
        "class_60.as",
        'var _loc8_ = "outdated (" + int(_loc3_.gameVersion) + " vs " + "10090" + ");";\n',
      );
      const found = yield* extractor.extract(dir);
      expect(found).toEqual({ clientBuild: "10090", swzKey: 762411009 });
    }),
  );

  it.effect("fails on ambiguous Init values", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const extractor = yield* KeyExtractor;
      const dir = yield* fs.makeTempDirectory({ prefix: "key-ex-" });
      yield* writeAs(dir, "a.as", "ANE_RawData.Init(1);\nANE_RawData.Init(2);\n");
      const result = yield* Effect.result(extractor.extract(dir));
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(KeyNotFound);
    }),
  );

  it.effect("does not treat var_10090 as the build id", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const extractor = yield* KeyExtractor;
      const dir = yield* fs.makeTempDirectory({ prefix: "key-ex-" });
      yield* writeAs(
        dir,
        "a.as",
        'ANE_RawData.Init(9);\npublic static var var_10090:String = "nope";\n',
      );
      const result = yield* Effect.result(extractor.extract(dir));
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(BuildIdNotFound);
    }),
  );

  it.effect("emits StepProgress with .as file counts", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const extractor = yield* KeyExtractor;
      const { layer: reporterLayer, events } = yield* PatchReporter.collecting();
      const dir = yield* fs.makeTempDirectory({ prefix: "key-ex-" });
      yield* writeAs(dir, "class_316.as", "ANE_RawData.Init(762411009);\n");
      yield* writeAs(dir, "class_60.as", 'vs "10090"\n');
      yield* extractor.extract(dir).pipe(Effect.provide(reporterLayer));
      const recorded = yield* Ref.get(events);
      const progress = recorded.filter((event) => event._tag === "StepProgress");
      expect(progress.length).toBeGreaterThan(0);
      expect(progress.every((event) => event.step === "ExtractKeys")).toBe(true);
      expect(progress.some((event) => event.detail.includes(".as"))).toBe(true);
      const last = progress[progress.length - 1];
      expect(last?.fraction).toBe(1);
    }),
  );
});
