import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { CachePaths } from "./CachePaths.ts";
import { KeyConflict } from "./errors.ts";
import { PatchIndexText } from "./schemas.ts";
import { VersionRegistry } from "./VersionRegistry.ts";

const AppLive = VersionRegistry.layer.pipe(
  Layer.provide(CachePaths.layer),
  Layer.provideMerge(NodeServices.layer),
);

const sample = {
  steamAppId: 291550,
  steamDepotId: 291551,
  steamManifestId: "123",
  fullDepot: false,
  clientBuild: "10090",
  swzKey: 762411009,
  swf: "BrawlhallaAir.swf",
  files: ["BrawlhallaAir.swf"],
};

layer(AppLive)("VersionRegistry", (it) => {
  it.effect("writes registry and sets latestManifestId only on public fetch", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const registry = yield* VersionRegistry;
      const root = yield* fs.makeTempDirectory({ prefix: "reg-" });
      yield* registry.writePatch(root, sample, true);
      const read = yield* registry.readPatch(root, "123");
      expect(read).toEqual(sample);
      const index = yield* Schema.decodeUnknownEffect(PatchIndexText)(
        yield* fs.readFileString(path.join(root, "index.json")),
      );
      expect(index.latestManifestId).toBe("123");
      yield* registry.writePatch(
        root,
        { ...sample, steamManifestId: "old", clientBuild: "9" },
        false,
      );
      const index2 = yield* Schema.decodeUnknownEffect(PatchIndexText)(
        yield* fs.readFileString(path.join(root, "index.json")),
      );
      expect(index2.latestManifestId).toBe("123");
      expect(index2.patches["old"]?.clientBuild).toBe("9");
    }),
  );

  it.effect("merges version-keys and conflicts on a different key", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const registry = yield* VersionRegistry;
      const dir = yield* fs.makeTempDirectory({ prefix: "keys-" });
      const filePath = path.join(dir, "version-keys.json");
      yield* fs.writeFileString(
        filePath,
        `${JSON.stringify({ keys: { "1": 1 }, aliases: { latest: "1" } }, null, 2)}\n`,
      );
      yield* registry.mergeVersionKeys(filePath, "10090", 762411009, false);
      const afterHist = yield* fs.readFileString(filePath);
      expect(afterHist).toContain("10090");
      expect(afterHist).toContain('"latest": "1"');
      yield* registry.mergeVersionKeys(filePath, "10090", 762411009, true);
      const afterPub = yield* fs.readFileString(filePath);
      expect(afterPub).toContain('"latest": "10090"');
      const conflict = yield* Effect.result(registry.mergeVersionKeys(filePath, "10090", 99, true));
      expect(conflict._tag).toBe("Failure");
      if (conflict._tag === "Failure") expect(conflict.failure).toBeInstanceOf(KeyConflict);
    }),
  );
});
