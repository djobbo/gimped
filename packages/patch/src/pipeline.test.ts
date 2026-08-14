import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { CachePaths } from "./CachePaths.ts";
import { DepotClient } from "./DepotClient.ts";
import { Ffdec } from "./Ffdec.ts";
import { KeyExtractor } from "./KeyExtractor.ts";
import { fetch, Pipeline } from "./pipeline.ts";
import { ToolCache } from "./ToolCache.ts";
import { VersionRegistry } from "./VersionRegistry.ts";

const counts = { download: 0, export: 0 };

const MockTools = Layer.succeed(ToolCache, {
  ensureDepotDownloader: (_root: string) => Effect.succeed("DepotDownloader.exe"),
  ensureJpexs: (_root: string) => Effect.succeed({ kind: "jar" as const, path: "ffdec.jar" }),
});

const MockDepot = Layer.succeed(DepotClient, {
  parseManifestId: (_output: string) => Effect.succeed("123"),
  resolvePublicManifest: (_root: string) => Effect.succeed("123"),
  download: (_root: string, _manifestId: string, _full: boolean) =>
    Effect.sync(() => {
      counts.download += 1;
    }),
});

const AppLive = Pipeline.layer.pipe(
  Layer.provide(MockTools),
  Layer.provide(MockDepot),
  Layer.provide(
    Layer.succeed(Ffdec, {
      findSwf: (depotDir: string) => Effect.succeed(`${depotDir}/BrawlhallaAir.swf`),
      exportScripts: (_root: string, _depot: string, scriptsDir: string) =>
        Effect.gen(function* () {
          counts.export += 1;
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          yield* fs.makeDirectory(scriptsDir, { recursive: true });
          yield* fs.writeFileString(
            path.join(scriptsDir, "a.as"),
            'ANE_RawData.Init(762411009);\nvs "10090"\n',
          );
          return "BrawlhallaAir.swf";
        }),
    }),
  ),
  Layer.provideMerge(KeyExtractor.layer),
  Layer.provideMerge(VersionRegistry.layer),
  Layer.provideMerge(CachePaths.layer),
  Layer.provideMerge(NodeServices.layer),
);

layer(AppLive)("Pipeline.fetch", (it) => {
  it.effect("skips download and ffdec when registry exists", () =>
    Effect.gen(function* () {
      counts.download = 0;
      counts.export = 0;
      const fs = yield* FileSystem.FileSystem;
      const versions = yield* VersionRegistry;
      const root = yield* fs.makeTempDirectory({ prefix: "pipe-" });
      yield* versions.writePatch(
        root,
        {
          steamAppId: 291550,
          steamDepotId: 291551,
          steamManifestId: "123",
          fullDepot: false,
          clientBuild: "10090",
          swzKey: 762411009,
          swf: "BrawlhallaAir.swf",
          files: ["BrawlhallaAir.swf"],
        },
        false,
      );
      const result = yield* fetch({ cacheDir: root, full: false });
      expect(result.steamManifestId).toBe("123");
      expect(counts.download).toBe(0);
      expect(counts.export).toBe(0);
    }),
  );

  it.effect("runs ffdec only when depot SWF exists without scripts", () =>
    Effect.gen(function* () {
      counts.download = 0;
      counts.export = 0;
      const fs = yield* FileSystem.FileSystem;
      const paths = yield* CachePaths;
      const root = yield* fs.makeTempDirectory({ prefix: "pipe-" });
      const path = yield* Path.Path;
      const depot = paths.depotDir(root, "123");
      yield* fs.makeDirectory(depot, { recursive: true });
      yield* fs.writeFileString(path.join(depot, "BrawlhallaAir.swf"), "swf");
      const result = yield* fetch({ cacheDir: root, full: false });
      expect(result.swzKey).toBe(762411009);
      expect(counts.download).toBe(0);
      expect(counts.export).toBe(1);
    }),
  );
});
