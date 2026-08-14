import { Effect, FileSystem, Path } from "effect";

export const findWorkspaceRoot = Effect.fn("findWorkspaceRoot")(function* (
  startPaths: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  for (const start of startPaths) {
    let current = path.resolve(start);
    while (true) {
      if (yield* fs.exists(path.join(current, "pnpm-workspace.yaml"))) {
        return current;
      }
      const parent = path.resolve(current, "..");
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }
  return undefined;
});

export const versionKeysPath = Effect.fn("versionKeysPath")(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(root, "packages", "swz", "src", "version-keys.json");
  return (yield* fs.exists(file)) ? file : undefined;
});
