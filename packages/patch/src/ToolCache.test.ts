import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { CachePaths } from "./CachePaths.ts";
import { DEPOT_REPO, JPEXS_REPO } from "./constants.ts";
import { GithubRelease } from "./GithubRelease.ts";
import { PatchReporter } from "./PatchReporter.ts";
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
      if (repo === DEPOT_REPO) {
        yield* fs.writeFileString(path.join(destDir, "DepotDownloader.exe"), "fake");
      } else {
        yield* fs.writeFileString(path.join(destDir, "ffdec.jar"), "fake");
      }
    }),
}));

const AppLive = ToolCache.layer.pipe(
  Layer.provideMerge(CachePaths.layer),
  Layer.provide(MockGithub),
  Layer.provide(MockPlatform),
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(PatchReporter.noop),
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

  it.effect("prefers ffdec-cli.exe over ffdec.jar", () =>
    Effect.gen(function* () {
      calls.length = 0;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const paths = yield* CachePaths;
      const cache = yield* ToolCache;

      const root = yield* fs.makeTempDirectory({ prefix: "jpexs-cli-" });
      const toolDir = paths.jpexsToolDir(root);
      yield* fs.makeDirectory(toolDir, { recursive: true });
      const cliPath = path.join(toolDir, "ffdec-cli.exe");
      yield* fs.writeFileString(cliPath, "cli");
      yield* fs.writeFileString(path.join(toolDir, "ffdec.jar"), "jar");
      yield* fs.writeFileString(path.join(toolDir, "ffdec.bat"), "bat");

      const result = yield* cache.ensureJpexs(root);
      expect(result).toEqual({ kind: "cli", path: cliPath });
      expect(calls).toEqual([]);
    }),
  );

  it.effect("uses ffdec.jar when cli is absent, ignoring ffdec.bat", () =>
    Effect.gen(function* () {
      calls.length = 0;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const paths = yield* CachePaths;
      const cache = yield* ToolCache;

      const root = yield* fs.makeTempDirectory({ prefix: "jpexs-jar-" });
      const toolDir = paths.jpexsToolDir(root);
      yield* fs.makeDirectory(toolDir, { recursive: true });
      const jarPath = path.join(toolDir, "ffdec.jar");
      yield* fs.writeFileString(jarPath, "jar");
      yield* fs.writeFileString(path.join(toolDir, "ffdec.bat"), "bat");

      const result = yield* cache.ensureJpexs(root);
      expect(result).toEqual({ kind: "jar", path: jarPath });
      expect(calls).toEqual([]);
    }),
  );

  it.effect("downloads JPEXS when neither cli nor jar is present", () =>
    Effect.gen(function* () {
      calls.length = 0;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const paths = yield* CachePaths;
      const cache = yield* ToolCache;

      const root = yield* fs.makeTempDirectory({ prefix: "jpexs-miss-" });
      const toolDir = paths.jpexsToolDir(root);
      yield* fs.makeDirectory(toolDir, { recursive: true });
      yield* fs.writeFileString(path.join(toolDir, "ffdec.bat"), "bat");

      const result = yield* cache.ensureJpexs(root);
      expect(result).toEqual({ kind: "jar", path: path.join(toolDir, "ffdec.jar") });
      expect(calls).toEqual([JPEXS_REPO]);
    }),
  );
});
