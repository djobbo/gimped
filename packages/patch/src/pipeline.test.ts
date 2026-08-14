import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, Fiber, FileSystem, Layer, Path, Stream } from "effect";
import { CachePaths } from "./CachePaths.ts";
import { DepotClient } from "./DepotClient.ts";
import { Ffdec } from "./Ffdec.ts";
import { KeyExtractor } from "./KeyExtractor.ts";
import { clearPatch, fetch, fetchStream, Pipeline } from "./pipeline.ts";
import { ToolCache } from "./ToolCache.ts";
import { VersionRegistry } from "./VersionRegistry.ts";

const counts = { download: 0, export: 0, interruptDownload: false };

const sampleRegistry = {
  steamAppId: 291550,
  steamDepotId: 291551,
  steamManifestId: "123",
  fullDepot: false,
  clientBuild: "10090",
  swzKey: 762411009,
  swf: "BrawlhallaAir.swf",
  files: ["BrawlhallaAir.swf"],
};

const MockTools = Layer.succeed(ToolCache, {
  ensureDepotDownloader: (_root: string) => Effect.succeed("DepotDownloader.exe"),
  ensureJpexs: (_root: string) => Effect.succeed({ kind: "jar" as const, path: "ffdec.jar" }),
});

const MockDepot = Layer.succeed(DepotClient, {
  parseManifestId: (_output: string) => Effect.succeed("123"),
  resolvePublicManifest: (_root: string) => Effect.succeed("123"),
  download: (root: string, manifestId: string, _full: boolean) =>
    Effect.gen(function* () {
      if (counts.interruptDownload) {
        counts.download += 1;
        return yield* Effect.never;
      }
      counts.download += 1;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const paths = yield* CachePaths;
      const depot = paths.depotDir(root, manifestId);
      yield* fs.makeDirectory(depot, { recursive: true });
      yield* fs.writeFileString(path.join(depot, "BrawlhallaAir.swf"), "swf");
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
      counts.interruptDownload = false;
      const fs = yield* FileSystem.FileSystem;
      const versions = yield* VersionRegistry;
      const root = yield* fs.makeTempDirectory({ prefix: "pipe-" });
      yield* versions.writePatch(root, sampleRegistry, false);
      const result = yield* fetch({ cacheDir: root, full: false, force: false });
      expect(result.steamManifestId).toBe("123");
      expect(counts.download).toBe(0);
      expect(counts.export).toBe(0);
    }),
  );

  it.effect("runs ffdec only when depot SWF exists without scripts", () =>
    Effect.gen(function* () {
      counts.download = 0;
      counts.export = 0;
      counts.interruptDownload = false;
      const fs = yield* FileSystem.FileSystem;
      const paths = yield* CachePaths;
      const root = yield* fs.makeTempDirectory({ prefix: "pipe-" });
      const path = yield* Path.Path;
      const depot = paths.depotDir(root, "123");
      yield* fs.makeDirectory(depot, { recursive: true });
      yield* fs.writeFileString(path.join(depot, "BrawlhallaAir.swf"), "swf");
      const result = yield* fetch({ cacheDir: root, full: false, force: false });
      expect(result.swzKey).toBe(762411009);
      expect(counts.download).toBe(0);
      expect(counts.export).toBe(1);
    }),
  );

  it.effect("force true with existing registry still calls download and export", () =>
    Effect.gen(function* () {
      counts.download = 0;
      counts.export = 0;
      counts.interruptDownload = false;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const paths = yield* CachePaths;
      const versions = yield* VersionRegistry;
      const root = yield* fs.makeTempDirectory({ prefix: "pipe-" });
      yield* versions.writePatch(root, sampleRegistry, false);
      const depot = paths.depotDir(root, "123");
      const scripts = paths.scriptsDir(root, "123");
      yield* fs.makeDirectory(depot, { recursive: true });
      yield* fs.makeDirectory(scripts, { recursive: true });
      yield* fs.writeFileString(path.join(depot, "BrawlhallaAir.swf"), "swf");
      yield* fs.writeFileString(
        path.join(scripts, "a.as"),
        'ANE_RawData.Init(762411009);\nvs "10090"\n',
      );
      const result = yield* fetch({ cacheDir: root, full: false, force: true });
      expect(result.steamManifestId).toBe("123");
      expect(counts.download).toBeGreaterThanOrEqual(1);
      expect(counts.export).toBeGreaterThanOrEqual(1);
    }),
  );

  it.effect("fetchStream yields Completed matching unary fetch", () =>
    Effect.gen(function* () {
      counts.download = 0;
      counts.export = 0;
      counts.interruptDownload = false;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const paths = yield* CachePaths;
      const root = yield* fs.makeTempDirectory({ prefix: "pipe-" });
      const depot = paths.depotDir(root, "123");
      yield* fs.makeDirectory(depot, { recursive: true });
      yield* fs.writeFileString(path.join(depot, "BrawlhallaAir.swf"), "swf");
      const fromFetch = yield* fetch({ cacheDir: root, full: false, force: false });
      const stream = yield* fetchStream({ cacheDir: root, full: false, force: false });
      const events = yield* Stream.runCollect(stream);
      const completed = events.find((event) => event._tag === "Completed");
      expect(completed?._tag).toBe("Completed");
      if (completed?._tag === "Completed") {
        expect(completed.registry).toEqual(fromFetch);
      }
    }),
  );

  it.effect("clearPatch deletes patch dir and leaves tools", () =>
    Effect.gen(function* () {
      counts.interruptDownload = false;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const paths = yield* CachePaths;
      const versions = yield* VersionRegistry;
      const root = yield* fs.makeTempDirectory({ prefix: "pipe-" });
      yield* versions.writePatch(root, sampleRegistry, false);
      const toolFile = path.join(paths.depotToolDir(root), "x");
      yield* fs.makeDirectory(paths.depotToolDir(root), { recursive: true });
      yield* fs.writeFileString(toolFile, "keep");
      yield* clearPatch(root, "123");
      expect(yield* fs.exists(paths.patchDir(root, "123"))).toBe(false);
      expect(yield* fs.exists(toolFile)).toBe(true);
    }),
  );

  it.effect("interrupt deletes incomplete patch dir for known manifest", () =>
    Effect.gen(function* () {
      counts.download = 0;
      counts.export = 0;
      counts.interruptDownload = true;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const paths = yield* CachePaths;
      const root = yield* fs.makeTempDirectory({ prefix: "pipe-" });
      const patchDir = paths.patchDir(root, "123");
      yield* fs.makeDirectory(patchDir, { recursive: true });
      yield* fs.writeFileString(path.join(patchDir, "incomplete.txt"), "x");
      const stream = yield* fetchStream({
        cacheDir: root,
        full: false,
        force: false,
        manifestId: "123",
      });
      const fiber = yield* Stream.runCollect(stream).pipe(
        Effect.forkChild({ startImmediately: true }),
      );
      yield* Effect.sync(() => counts.download).pipe(
        Effect.repeat({ until: (n: number) => n >= 1 }),
      );
      yield* Fiber.interrupt(fiber);
      expect(yield* fs.exists(patchDir)).toBe(false);
    }),
  );
});
