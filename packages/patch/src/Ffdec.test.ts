import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { MissingSwf } from "./errors.ts";
import { Ffdec } from "./Ffdec.ts";
import { PatchReporter } from "./PatchReporter.ts";
import { ToolCache } from "./ToolCache.ts";

const MockToolCache = Layer.succeed(ToolCache, {
  ensureDepotDownloader: () => Effect.die("ensureDepotDownloader should not be called"),
  ensureJpexs: () => Effect.die("ensureJpexs should not be called"),
});

const AppLive = Ffdec.layer.pipe(
  Layer.provide(MockToolCache),
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(PatchReporter.noop),
);

layer(AppLive)("Ffdec.findSwf", (it) => {
  it.effect("prefers BrawlhallaAir.swf when multiple swfs exist", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const ffdec = yield* Ffdec;
      const depot = yield* fs.makeTempDirectory({ prefix: "swf-air-" });
      yield* fs.writeFileString(path.join(depot, "BrawlhallaAir.swf"), "air");
      yield* fs.writeFileString(path.join(depot, "other.swf"), "other");
      const swf = yield* ffdec.findSwf(depot);
      expect(swf).toBe(path.join(depot, "BrawlhallaAir.swf"));
    }),
  );

  it.effect("returns the sole *.swf when Air is absent", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const ffdec = yield* Ffdec;
      const depot = yield* fs.makeTempDirectory({ prefix: "swf-one-" });
      yield* fs.writeFileString(path.join(depot, "foo.swf"), "foo");
      const swf = yield* ffdec.findSwf(depot);
      expect(swf).toBe(path.join(depot, "foo.swf"));
    }),
  );

  it.effect("fails MissingSwf when two non-Air swfs exist", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const ffdec = yield* Ffdec;
      const depot = yield* fs.makeTempDirectory({ prefix: "swf-two-" });
      yield* fs.writeFileString(path.join(depot, "a.swf"), "a");
      yield* fs.writeFileString(path.join(depot, "b.swf"), "b");
      const result = yield* Effect.result(ffdec.findSwf(depot));
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(MissingSwf);
        expect(result.failure.path).toBe(depot);
      }
    }),
  );

  it.effect("fails MissingSwf when depot has no swfs", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const ffdec = yield* Ffdec;
      const depot = yield* fs.makeTempDirectory({ prefix: "swf-empty-" });
      const result = yield* Effect.result(ffdec.findSwf(depot));
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(MissingSwf);
        expect(result.failure.path).toBe(depot);
      }
    }),
  );
});
