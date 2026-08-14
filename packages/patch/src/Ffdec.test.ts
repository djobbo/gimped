import { NodeServices } from "@effect/platform-node";
import { expect, it, layer } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { FFDEC_DEFAULT_MEMORY } from "./constants.ts";
import { MissingSwf } from "./errors.ts";
import { Ffdec, ffdecSpawn } from "./Ffdec.ts";
import { ToolCache } from "./ToolCache.ts";

const MockToolCache = Layer.succeed(ToolCache, {
  ensureDepotDownloader: () => Effect.die("ensureDepotDownloader should not be called"),
  ensureJpexs: () => Effect.die("ensureJpexs should not be called"),
});

const AppLive = Ffdec.layer.pipe(
  Layer.provide(MockToolCache),
  Layer.provideMerge(NodeServices.layer),
);

it("caps the jar JVM heap so Launch4j cannot request all of RAM", () => {
  expect(
    ffdecSpawn(
      { kind: "jar", path: "ffdec.jar" },
      "scripts",
      "BrawlhallaAir.swf",
      FFDEC_DEFAULT_MEMORY,
    ),
  ).toEqual({
    bin: "java",
    args: [
      `-Xmx${FFDEC_DEFAULT_MEMORY}`,
      "-jar",
      "ffdec.jar",
      "-export",
      "script",
      "scripts",
      "BrawlhallaAir.swf",
    ],
  });
});

it("honors FFDEC_MEMORY for the jar heap cap", () => {
  expect(ffdecSpawn({ kind: "jar", path: "ffdec.jar" }, "scripts", "game.swf", "1024m")).toEqual({
    bin: "java",
    args: ["-Xmx1024m", "-jar", "ffdec.jar", "-export", "script", "scripts", "game.swf"],
  });
});

it("leaves cli launch args unchanged", () => {
  expect(ffdecSpawn({ kind: "cli", path: "ffdec-cli.exe" }, "scripts", "game.swf", "4g")).toEqual({
    bin: "ffdec-cli.exe",
    args: ["-export", "script", "scripts", "game.swf"],
  });
});

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
