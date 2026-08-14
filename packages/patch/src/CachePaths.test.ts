import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { ConfigProvider, Effect, Layer, Path } from "effect";
import { CachePaths } from "./CachePaths.ts";

const AppLive = CachePaths.layer.pipe(Layer.provideMerge(NodeServices.layer));

layer(AppLive)("CachePaths", (it) => {
  it.effect("prefers explicit cacheDir over env", () =>
    Effect.gen(function* () {
      const paths = yield* CachePaths;
      const path = yield* Path.Path;
      const root = yield* paths.resolveRoot("D:/cache/gimped");
      expect(root).toBe(path.resolve("D:/cache/gimped"));
      expect(paths.depotDir(root, "99")).toBe(path.join(root, "patches", "99", "depot"));
    }).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv()))),
  );

  it.effect("uses GIMPED_CACHE when cacheDir is omitted", () =>
    Effect.gen(function* () {
      const paths = yield* CachePaths;
      const path = yield* Path.Path;
      const root = yield* paths.resolveRoot();
      expect(root).toBe(path.resolve("E:/from-env"));
    }).pipe(
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromUnknown({ GIMPED_CACHE: "E:/from-env" })),
      ),
    ),
  );
});
