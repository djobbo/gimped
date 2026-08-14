import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { CachePaths } from "./CachePaths.ts";
import { DEPOT_REPO } from "./constants.ts";
import { GithubRelease } from "./GithubRelease.ts";
import { ToolCache } from "./ToolCache.ts";
import { ToolPlatform } from "./ToolPlatform.ts";

const calls: Array<string> = [];

const MockPlatform = Layer.succeed(ToolPlatform, { os: "win32", arch: "x64" });

const MockGithub = Layer.sync(GithubRelease, () => ({
  downloadLatestAsset: (repo: string, destDir: string, _pickAsset: (name: string) => boolean) =>
    Effect.gen(function* () {
      calls.push(repo);
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.makeDirectory(destDir, { recursive: true });
      yield* fs.writeFileString(path.join(destDir, "DepotDownloader.exe"), "fake");
    }),
}));

const AppLive = ToolCache.layer.pipe(
  Layer.provideMerge(CachePaths.layer),
  Layer.provide(MockGithub),
  Layer.provide(MockPlatform),
  Layer.provideMerge(NodeServices.layer),
);

layer(AppLive)("ToolCache", (it) => {
  it.effect("returns existing DepotDownloader without downloading", () =>
    Effect.gen(function* () {
      calls.length = 0;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const paths = yield* CachePaths;
      const cache = yield* ToolCache;

      const root = yield* fs.makeTempDirectory({ prefix: "toolcache-hit-" });
      const depotDir = paths.depotToolDir(root);
      yield* fs.makeDirectory(depotDir, { recursive: true });
      const exePath = path.join(depotDir, "DepotDownloader.exe");
      yield* fs.writeFileString(exePath, "cached");

      const result = yield* cache.ensureDepotDownloader(root);
      expect(result).toBe(exePath);
      expect(calls).toEqual([]);
    }),
  );

  it.effect("downloads DepotDownloader when missing then returns path", () =>
    Effect.gen(function* () {
      calls.length = 0;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const paths = yield* CachePaths;
      const cache = yield* ToolCache;

      const root = yield* fs.makeTempDirectory({ prefix: "toolcache-miss-" });
      yield* fs.makeDirectory(paths.depotToolDir(root), { recursive: true });

      const result = yield* cache.ensureDepotDownloader(root);
      expect(result).toBe(path.join(paths.depotToolDir(root), "DepotDownloader.exe"));
      expect(calls).toEqual([DEPOT_REPO]);
    }),
  );
});
