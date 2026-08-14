import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";
import { findWorkspaceRoot, versionKeysPath } from "./workspace.ts";

const run = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer), Effect.scoped);

describe("workspace", () => {
  it.effect("findWorkspaceRoot walks parents until pnpm-workspace.yaml", () =>
    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "ws-root-" });
        const nested = path.join(root, "apps", "client");
        yield* fs.makeDirectory(nested, { recursive: true });
        yield* fs.writeFileString(
          path.join(root, "pnpm-workspace.yaml"),
          "packages:\n  - apps/*\n",
        );
        expect(yield* findWorkspaceRoot([nested])).toBe(path.resolve(root));
      }),
    ),
  );

  it.effect("findWorkspaceRoot returns undefined when no workspace yaml exists", () =>
    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const orphan = yield* fs.makeTempDirectoryScoped({ prefix: "ws-orphan-" });
        expect(yield* findWorkspaceRoot([orphan])).toBeUndefined();
      }),
    ),
  );

  it.effect("versionKeysPath returns the json path when the file exists", () =>
    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "ws-keys-" });
        yield* fs.writeFileString(path.join(root, "pnpm-workspace.yaml"), "");
        const keysDir = path.join(root, "packages", "swz", "src");
        yield* fs.makeDirectory(keysDir, { recursive: true });
        const keysFile = path.join(keysDir, "version-keys.json");
        yield* fs.writeFileString(keysFile, "{}");
        expect(yield* versionKeysPath(root)).toBe(keysFile);
      }),
    ),
  );

  it.effect("versionKeysPath returns undefined when the json file is missing", () =>
    run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "ws-nokeys-" });
        yield* fs.writeFileString(path.join(root, "pnpm-workspace.yaml"), "");
        expect(yield* versionKeysPath(root)).toBeUndefined();
      }),
    ),
  );
});
