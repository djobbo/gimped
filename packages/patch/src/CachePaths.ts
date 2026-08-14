import { Config, Context, Effect, Layer, Option, Path } from "effect";

export class CachePaths extends Context.Service<
  CachePaths,
  {
    readonly resolveRoot: (cacheDir?: string) => Effect.Effect<string>;
    readonly toolsDir: (root: string) => string;
    readonly depotToolDir: (root: string) => string;
    readonly jpexsToolDir: (root: string) => string;
    readonly patchDir: (root: string, manifestId: string) => string;
    readonly depotDir: (root: string, manifestId: string) => string;
    readonly scriptsDir: (root: string, manifestId: string) => string;
    readonly registryPath: (root: string, manifestId: string) => string;
    readonly indexPath: (root: string) => string;
  }
>()("@gimped/patch/CachePaths") {
  static readonly layer: Layer.Layer<CachePaths, never, Path.Path> = Layer.effect(
    CachePaths,
    Effect.gen(function* () {
      const path = yield* Path.Path;

      const resolveRoot = Effect.fn("CachePaths.resolveRoot")(function* (cacheDir?: string) {
        if (cacheDir !== undefined) {
          return path.resolve(cacheDir);
        }

        const fromEnv = yield* Config.string("GIMPED_CACHE").pipe(Config.option);
        if (Option.isSome(fromEnv)) {
          return path.resolve(fromEnv.value);
        }

        const localAppData = yield* Config.string("LOCALAPPDATA").pipe(Config.option);
        if (Option.isSome(localAppData)) {
          return path.resolve(path.join(localAppData.value, "gimped"));
        }

        const home = yield* Config.string("HOME").pipe(Config.option);
        if (Option.isSome(home)) {
          return path.resolve(path.join(home.value, ".cache", "gimped"));
        }

        return path.resolve(path.join(".", ".cache", "gimped"));
      });

      const toolsDir = (root: string) => path.join(root, "tools");
      const depotToolDir = (root: string) => path.join(toolsDir(root), "depotdownloader");
      const jpexsToolDir = (root: string) => path.join(toolsDir(root), "jpexs");
      const patchDir = (root: string, manifestId: string) => path.join(root, "patches", manifestId);
      const depotDir = (root: string, manifestId: string) =>
        path.join(patchDir(root, manifestId), "depot");
      const scriptsDir = (root: string, manifestId: string) =>
        path.join(patchDir(root, manifestId), "scripts");
      const registryPath = (root: string, manifestId: string) =>
        path.join(patchDir(root, manifestId), "registry.json");
      const indexPath = (root: string) => path.join(root, "index.json");

      return {
        resolveRoot,
        toolsDir,
        depotToolDir,
        jpexsToolDir,
        patchDir,
        depotDir,
        scriptsDir,
        registryPath,
        indexPath,
      };
    }),
  );
}
