# Patch Fetch Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `@gimped/patch` + `@gimped/patch-cli` that cache DepotDownloader/JPEXS, download a Brawlhalla Steam patch, FFDec-export scripts, and write SWZ key + client build into registries.

**Architecture:** Effect services (`CachePaths`, `GithubRelease`, `ToolCache`, `DepotClient`, `Ffdec`, `KeyExtractor`, `VersionRegistry`, `Pipeline`). Tool download is a pipeline step that no-ops when the binary is already cached. Tests mock GitHub/Steam/FFDec; never hit the network.

**Tech Stack:** Effect `4.0.0-rc.109`, `@effect/platform-node` catalog, `@gimped/common`, `@gimped/swz` (`VersionKeyMap`), Vitest via Vite+ (`vp test`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-14-patch-pipeline-design.md`
- Follow `.repos/effect/LLMS.md` and shipped `effect` `AGENTS.md`: `Effect.fn("Name")` + `Effect.gen`; services via `Context.Service` + `static layer`; errors via `Schema.TaggedError`; JSON via `Schema` (no `JSON.parse` / `JSON.stringify`)
- Every behavioral module in `@gimped/patch` is a `Context.Service` with `static layer`. `errors.ts` / `constants.ts` / `schemas.ts` are data only. `layers.ts` / `index.ts` are wiring
- No `node:fs` (use `FileSystem` / `Path`). Spawn via `effect/unstable/process/ChildProcess`. HTTP via `effect/unstable/http/HttpClient`
- Steam: app `291550`, depot `291551`, `-os windows`. Auth from `STEAM_USERNAME` / `STEAM_PASSWORD` only (never anonymous)
- Offline tests only. Prefer TDD: failing test → implement → pass → `vp check --fix` in the package → commit per task
- Use `vp` (not pnpm/npm/yarn) for install/check/test

## File structure

| File                                    | Role                                          |
| --------------------------------------- | --------------------------------------------- |
| `packages/patch/package.json`           | `@gimped/patch`                               |
| `packages/patch/src/constants.ts`       | App/depot ids, GitHub repos, filelist         |
| `packages/patch/src/errors.ts`          | Tagged errors                                 |
| `packages/patch/src/schemas.ts`         | `PatchRegistry`, `PatchIndex`                 |
| `packages/patch/src/CachePaths.ts`      | Cache root + subpaths                         |
| `packages/patch/src/KeyExtractor.ts`    | Parse Init key + build id from `.as`          |
| `packages/patch/src/VersionRegistry.ts` | registry.json, index.json, version-keys merge |
| `packages/patch/src/GithubRelease.ts`   | GitHub latest asset download + tar unpack     |
| `packages/patch/src/ToolPlatform.ts`    | Host OS/arch for asset names                  |
| `packages/patch/src/ToolCache.ts`       | Ensure DepotDownloader / JPEXS binaries       |
| `packages/patch/src/DepotClient.ts`     | Resolve manifest + download depot             |
| `packages/patch/src/Ffdec.ts`           | Find SWF + export scripts                     |
| `packages/patch/src/pipeline.ts`        | `fetch` + skip rules                          |
| `packages/patch/src/layers.ts`          | `TestLive` / `layer`                          |
| `packages/patch/src/index.ts`           | Re-exports                                    |
| `packages/patch-cli/src/*`              | `patch fetch` CLI                             |
| `tsconfig.json`                         | Add project references                        |

---

### Task 1: Scaffold `@gimped/patch` with errors, constants, schemas

**Files:**

- Create: `packages/patch/package.json`
- Create: `packages/patch/tsconfig.json`
- Create: `packages/patch/vite.config.ts`
- Create: `packages/patch/src/constants.ts`
- Create: `packages/patch/src/errors.ts`
- Create: `packages/patch/src/schemas.ts`
- Create: `packages/patch/src/errors.test.ts`
- Create: `packages/patch/src/schemas.test.ts`
- Create: `packages/patch/src/index.ts`
- Modify: `tsconfig.json` (add `{ "path": "./packages/patch" }` to `references`)

**Interfaces:**

- Produces:
  - `STEAM_APP_ID = 291550`, `STEAM_DEPOT_ID = 291551`, `STEAM_OS = "windows"`
  - `FILELIST_BODY = "regex:.*\\.swf$\nregex:.*\\.swz$\n"`
  - `DEPOT_REPO = "SteamRE/DepotDownloader"`, `JPEXS_REPO = "jindrapetrik/jpexs-decompiler"`, `USER_AGENT = "gimped-patch"`
  - Tagged errors listed in the spec
  - `PatchRegistry`, `PatchRegistryText`, `PatchIndex`, `PatchIndexText`, `IndexEntry`

- [ ] **Step 1: Create package scaffold**

`packages/patch/package.json`:

```json
{
  "name": "@gimped/patch",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vp test",
    "build": "vp build",
    "check": "vp check"
  },
  "dependencies": {
    "@gimped/common": "workspace:*",
    "@gimped/swz": "workspace:*",
    "effect": "catalog:"
  },
  "devDependencies": {
    "@effect/platform-node": "catalog:",
    "@effect/vitest": "catalog:",
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vite-plus": "catalog:",
    "vitest": "catalog:"
  }
}
```

Copy `packages/anm/tsconfig.json` → `packages/patch/tsconfig.json`.

`packages/patch/vite.config.ts` — same as `packages/anm/vite.config.ts` (lib entry `src/index.ts`, externals `/^effect(?:\/|$)/`, `/^@effect\//`, `/^@gimped\//`, `/^node:/`).

Add the patch reference to root `tsconfig.json` `references`.

From workspace root: `vp i`

- [ ] **Step 2: Write the failing tests**

`packages/patch/src/errors.test.ts`:

```ts
import { describe, expect, it } from "@effect/vitest";
import {
  BuildIdNotFound,
  DepotDownloadFailed,
  FfdecFailed,
  KeyConflict,
  KeyNotFound,
  MissingJava,
  MissingSteamCredentials,
  MissingSwf,
  ToolDownloadFailed,
} from "./errors.ts";

describe("patch errors", () => {
  it("tags every pipeline error", () => {
    expect(new MissingSteamCredentials({ message: "missing" })._tag).toBe(
      "MissingSteamCredentials",
    );
    expect(new ToolDownloadFailed({ message: "gh" })._tag).toBe("ToolDownloadFailed");
    expect(new MissingJava({ message: "no java" })._tag).toBe("MissingJava");
    expect(new DepotDownloadFailed({ message: "steam" })._tag).toBe("DepotDownloadFailed");
    expect(new FfdecFailed({ message: "ffdec" })._tag).toBe("FfdecFailed");
    expect(new MissingSwf({ path: "/depot" })._tag).toBe("MissingSwf");
    expect(new KeyNotFound({ path: "/scripts" })._tag).toBe("KeyNotFound");
    expect(new BuildIdNotFound({ path: "/scripts" })._tag).toBe("BuildIdNotFound");
    expect(new KeyConflict({ version: "10090", existing: 1, actual: 2 })._tag).toBe("KeyConflict");
  });
});
```

`packages/patch/src/schemas.test.ts`:

```ts
import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { PatchIndexText, PatchRegistryText } from "./schemas.ts";

describe("patch schemas", () => {
  it("round-trips registry.json", () => {
    const raw = {
      steamAppId: 291550,
      steamDepotId: 291551,
      steamManifestId: "123",
      fullDepot: false,
      clientBuild: "10090",
      swzKey: 762411009,
      swf: "BrawlhallaAir.swf",
      files: ["BrawlhallaAir.swf", "Game.swz"],
    };
    const decoded = Schema.decodeUnknownSync(PatchRegistryText)(JSON.stringify(raw));
    expect(decoded.swzKey).toBe(762411009);
    const encoded = Schema.encodeUnknownSync(PatchRegistryText)(decoded);
    expect(JSON.parse(encoded).clientBuild).toBe("10090");
  });

  it("allows index.json without latestManifestId", () => {
    const decoded = Schema.decodeUnknownSync(PatchIndexText)(
      JSON.stringify({
        patches: {
          "123": { clientBuild: "10090", swzKey: 762411009, fetchedAt: "2026-08-14T10:00:00.000Z" },
        },
      }),
    );
    expect(decoded.latestManifestId).toBeUndefined();
    expect(decoded.patches["123"]?.clientBuild).toBe("10090");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `vp test` in `packages/patch`

Expected: FAIL (modules missing)

- [ ] **Step 4: Implement constants, errors, schemas, index**

`packages/patch/src/constants.ts`:

```ts
export const STEAM_APP_ID = 291550;
export const STEAM_DEPOT_ID = 291551;
export const STEAM_OS = "windows";
export const FILELIST_BODY = "regex:.*\\.swf$\nregex:.*\\.swz$\n";
export const DEPOT_REPO = "SteamRE/DepotDownloader";
export const JPEXS_REPO = "jindrapetrik/jpexs-decompiler";
export const USER_AGENT = "gimped-patch";
```

`packages/patch/src/errors.ts`:

```ts
import { Schema } from "effect";

export { IoError, MalformedJson } from "@gimped/common";

export class MissingSteamCredentials extends Schema.TaggedError<MissingSteamCredentials>()(
  "MissingSteamCredentials",
  { message: Schema.String },
) {}

export class ToolDownloadFailed extends Schema.TaggedError<ToolDownloadFailed>()(
  "ToolDownloadFailed",
  {
    message: Schema.String,
  },
) {}

export class MissingJava extends Schema.TaggedError<MissingJava>()("MissingJava", {
  message: Schema.String,
}) {}

export class DepotDownloadFailed extends Schema.TaggedError<DepotDownloadFailed>()(
  "DepotDownloadFailed",
  {
    message: Schema.String,
  },
) {}

export class FfdecFailed extends Schema.TaggedError<FfdecFailed>()("FfdecFailed", {
  message: Schema.String,
}) {}

export class MissingSwf extends Schema.TaggedError<MissingSwf>()("MissingSwf", {
  path: Schema.String,
}) {}

export class KeyNotFound extends Schema.TaggedError<KeyNotFound>()("KeyNotFound", {
  path: Schema.String,
}) {}

export class BuildIdNotFound extends Schema.TaggedError<BuildIdNotFound>()("BuildIdNotFound", {
  path: Schema.String,
}) {}

export class KeyConflict extends Schema.TaggedError<KeyConflict>()("KeyConflict", {
  version: Schema.String,
  existing: Schema.Number,
  actual: Schema.Number,
}) {}
```

`packages/patch/src/schemas.ts`:

```ts
import { Schema } from "effect";

export const PatchRegistry = Schema.Struct({
  steamAppId: Schema.Number,
  steamDepotId: Schema.Number,
  steamManifestId: Schema.String,
  fullDepot: Schema.Boolean,
  clientBuild: Schema.String,
  swzKey: Schema.Number,
  swf: Schema.String,
  files: Schema.Array(Schema.String),
});
export const PatchRegistryText = Schema.fromJsonString(PatchRegistry, { space: 2 });
export type PatchRegistry = typeof PatchRegistry.Type;

export const IndexEntry = Schema.Struct({
  clientBuild: Schema.String,
  swzKey: Schema.Number,
  fetchedAt: Schema.String,
});
export type IndexEntry = typeof IndexEntry.Type;

export const PatchIndex = Schema.Struct({
  latestManifestId: Schema.optionalKey(Schema.String),
  patches: Schema.Record(Schema.String, IndexEntry),
});
export const PatchIndexText = Schema.fromJsonString(PatchIndex, { space: 2 });
export type PatchIndex = typeof PatchIndex.Type;
```

`packages/patch/src/index.ts`:

```ts
export * from "./constants.ts";
export * from "./errors.ts";
export * from "./schemas.ts";
```

- [ ] **Step 5: Run tests and check**

Run: `vp test` then `vp check --fix` in `packages/patch`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/patch tsconfig.json pnpm-lock.yaml
git commit -m "feat(patch): scaffold package with errors and registry schemas"
```

---

### Task 2: CachePaths

**Files:**

- Create: `packages/patch/src/CachePaths.ts`
- Create: `packages/patch/src/CachePaths.test.ts`

**Interfaces:**

- Consumes: none
- Produces `CachePaths` `@gimped/patch/CachePaths`:
  - `resolveRoot(cacheDir?: string): Effect<string>`
  - `toolsDir(root: string): string`
  - `depotToolDir(root: string): string`
  - `jpexsToolDir(root: string): string`
  - `patchDir(root: string, manifestId: string): string`
  - `depotDir(root: string, manifestId: string): string`
  - `scriptsDir(root: string, manifestId: string): string`
  - `registryPath(root: string, manifestId: string): string`
  - `indexPath(root: string): string`

Resolution order: explicit `cacheDir` → env `GIMPED_CACHE` (via `Config.string("GIMPED_CACHE").pipe(Config.option)`) → Windows `LOCALAPPDATA/gimped` else `$HOME/.cache/gimped` (read `LOCALAPPDATA` / `HOME` the same way). Path joins via `Path.Path`.

- [ ] **Step 1: Write the failing test**

```ts
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
    }).pipe(Effect.provide(Layer.setConfigProvider(ConfigProvider.fromEnv()))),
  );

  it.effect("uses GIMPED_CACHE when cacheDir is omitted", () =>
    Effect.gen(function* () {
      const paths = yield* CachePaths;
      const path = yield* Path.Path;
      const root = yield* paths.resolveRoot();
      expect(root).toBe(path.resolve("E:/from-env"));
    }).pipe(
      Effect.provide(
        Layer.setConfigProvider(ConfigProvider.fromMap(new Map([["GIMPED_CACHE", "E:/from-env"]]))),
      ),
    ),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test` in `packages/patch`

Expected: FAIL (`CachePaths` missing)

- [ ] **Step 3: Implement CachePaths**

Use `Config.string` + `Config.option`. Default: if `LOCALAPPDATA` is present, `path.join(localAppData, "gimped")`, else `path.join(home, ".cache", "gimped")` (`HOME` required in that branch; if missing, `path.join(".", ".cache", "gimped")`).

Subpaths:

```
tools/depotdownloader
tools/jpexs
patches/<id>/depot
patches/<id>/scripts
patches/<id>/registry.json
index.json
```

Export `CachePaths` service + `static layer = Layer.effect(...)`.

- [ ] **Step 4: Run tests**

Run: `vp test` then `vp check --fix` in `packages/patch`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/patch/src/CachePaths.ts packages/patch/src/CachePaths.test.ts packages/patch/src/index.ts
git commit -m "feat(patch): resolve cache root and well-known subpaths"
```

Re-export `CachePaths` from `index.ts`.

---

### Task 3: KeyExtractor

**Files:**

- Create: `packages/patch/src/KeyExtractor.ts`
- Create: `packages/patch/src/KeyExtractor.test.ts`

**Interfaces:**

- Consumes: `FileSystem`, `Path`
- Produces `KeyExtractor` `@gimped/patch/KeyExtractor`:
  - `extract(scriptsDir: string): Effect<{ readonly clientBuild: string; readonly swzKey: number }, KeyNotFound | BuildIdNotFound | IoError>`

Scan `scriptsDir` with `readDirectory(dir, { recursive: true })`, keep names ending in `.as` (case-insensitive). Concatenate file texts.

- SWZ key: all `ANE_RawData.Init(<digits>)`. 0 matches or >1 distinct uint32 → `KeyNotFound({ path: scriptsDir })`. Else `>>> 0`.
- Build: first `vs "<digits>"`. Else first `gameVersion` within 80 chars of `"<digits>"`. Else `BuildIdNotFound`. Ignore `var_10090`.

- [ ] **Step 1: Write the failing test**

```ts
import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { BuildIdNotFound, KeyNotFound } from "./errors.ts";
import { KeyExtractor } from "./KeyExtractor.ts";

const AppLive = KeyExtractor.layer.pipe(Layer.provideMerge(NodeServices.layer));

const writeAs = Effect.fn("writeAs")(function* (dir: string, relative: string, body: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const filePath = path.join(dir, relative);
  yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
  yield* fs.writeFileString(filePath, body);
});

layer(AppLive)("KeyExtractor", (it) => {
  it.effect("reads Init key and vs-quoted build id", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const extractor = yield* KeyExtractor;
      const dir = yield* fs.makeTempDirectory({ prefix: "key-ex-" });
      yield* writeAs(dir, "class_316.as", "ANE_RawData.Init(762411009);\n");
      yield* writeAs(
        dir,
        "class_60.as",
        'var _loc8_ = "outdated (" + int(_loc3_.gameVersion) + " vs " + "10090" + ");";\n',
      );
      const found = yield* extractor.extract(dir);
      expect(found).toEqual({ clientBuild: "10090", swzKey: 762411009 });
    }),
  );

  it.effect("fails on ambiguous Init values", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const extractor = yield* KeyExtractor;
      const dir = yield* fs.makeTempDirectory({ prefix: "key-ex-" });
      yield* writeAs(dir, "a.as", "ANE_RawData.Init(1);\nANE_RawData.Init(2);\n");
      const result = yield* Effect.result(extractor.extract(dir));
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(KeyNotFound);
    }),
  );

  it.effect("does not treat var_10090 as the build id", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const extractor = yield* KeyExtractor;
      const dir = yield* fs.makeTempDirectory({ prefix: "key-ex-" });
      yield* writeAs(
        dir,
        "a.as",
        'ANE_RawData.Init(9);\npublic static var var_10090:String = "nope";\n',
      );
      const result = yield* Effect.result(extractor.extract(dir));
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(BuildIdNotFound);
    }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test` in `packages/patch`

Expected: FAIL

- [ ] **Step 3: Implement KeyExtractor**

`static layer` needing `FileSystem` + `Path`. Map platform errors with `toIoError`. Init regex: `/ANE_RawData\.Init\((\d+)\)/g`. Build regex: `/vs\s+"(\d+)"/` then fallback `/gameVersion[\s\S]{0,80}"(\d+)"/`.

- [ ] **Step 4: Run tests**

Run: `vp test` then `vp check --fix` in `packages/patch`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/patch/src/KeyExtractor.ts packages/patch/src/KeyExtractor.test.ts packages/patch/src/index.ts
git commit -m "feat(patch): extract SWZ key and client build from FFDec scripts"
```

---

### Task 4: VersionRegistry

**Files:**

- Create: `packages/patch/src/VersionRegistry.ts`
- Create: `packages/patch/src/VersionRegistry.test.ts`

**Interfaces:**

- Consumes: `FileSystem`, `Path`, `Clock`, `CachePaths`
- Produces `VersionRegistry` `@gimped/patch/VersionRegistry`:
  - `readPatch(root: string, manifestId: string): Effect<PatchRegistry | undefined, IoError | MalformedJson>`
  - `writePatch(root: string, registry: PatchRegistry, publicLatest: boolean): Effect<void, IoError | KeyConflict | MalformedJson>`
  - `mergeVersionKeys(versionKeysPath: string, clientBuild: string, swzKey: number, publicLatest: boolean): Effect<void, IoError | KeyConflict | MalformedJson>`

`writePatch` writes `registry.json`, upserts `index.json` (`patches[id]`, `fetchedAt` from `Clock.currentTimeMillis` via `new Date(millis).toISOString()`), sets `latestManifestId` only when `publicLatest`.

`mergeVersionKeys` uses `VersionKeyMap` from `@gimped/swz`. If `keys[clientBuild]` exists and `>>> 0` differs → `KeyConflict`. Else set key. If `publicLatest`, set `aliases.latest`. Preserve other aliases. Encode with `Schema.fromJsonString(VersionKeyMap, { space: 2 })` (or import if swz exports a text codec — if not, add `VersionKeyMapText` locally in this file).

`readPatch`: missing file → `undefined`; other IO → `IoError`; bad JSON → `MalformedJson`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

Import `Schema` from `effect` in that test. Do not use `JSON.parse` / `JSON.stringify` in `VersionRegistry` production code.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test` in `packages/patch`

Expected: FAIL

- [ ] **Step 3: Implement VersionRegistry**

- [ ] **Step 4: Run tests**

Run: `vp test` then `vp check --fix` in `packages/patch`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/patch/src/VersionRegistry.ts packages/patch/src/VersionRegistry.test.ts packages/patch/src/index.ts
git commit -m "feat(patch): write patch registry, cache index, and version-keys merge"
```

---

### Task 5: ToolPlatform + GithubRelease

**Files:**

- Create: `packages/patch/src/ToolPlatform.ts`
- Create: `packages/patch/src/GithubRelease.ts`
- Create: `packages/patch/src/GithubRelease.test.ts`

**Interfaces:**

- Consumes: `HttpClient`, `FileSystem`, `Path`, `ChildProcessSpawner`, `ToolPlatform`
- Produces:
  - `ToolPlatform` `@gimped/patch/ToolPlatform`: `{ readonly os: "win32" | "linux" | "darwin"; readonly arch: "x64" | "arm64" }` with `layer` reading `process.platform` / `process.arch` (map unknown arch to `"x64"`)
  - `GithubRelease` `@gimped/patch/GithubRelease`:
    - `downloadLatestAsset(repo: string, destDir: string, pickAsset: (name: string) => boolean): Effect<void, ToolDownloadFailed | IoError>`

Flow: `HttpClient.get("https://api.github.com/repos/${repo}/releases/latest", { headers: { "User-Agent": USER_AGENT, Accept: "application/vnd.github+json" } })`, `filterStatusOk`, `schemaBodyJson` of `{ tag_name, assets: [{ name, browser_download_url }] }`. No pick → `ToolDownloadFailed`. GET the zip URL, `arrayBuffer` → `writeFile`. `makeDirectory(destDir, { recursive: true })`. Unpack: `ChildProcess.make("tar", ["-xf", zipPath, "-C", destDir])`, collect `all` + `exitCode`; non-zero → `ToolDownloadFailed`. Delete the zip after successful unpack.

- [ ] **Step 1: Write the failing test**

Mock fetch with `Layer.succeed(FetchHttpClient.Fetch, fakeFetch)` + `FetchHttpClient.layer` + `NodeServices`. `fakeFetch` returns release JSON for `api.github.com` and zip bytes for the asset URL.

Create zip bytes in the test: write a tiny file in a temp dir, run `ChildProcess.make("tar", ["-a", "-cf", zipPath, "-C", dir, "hello.txt"])` (Windows `tar` supports `-a` zip). Read those bytes into the fake fetch.

After `downloadLatestAsset`, expect `hello.txt` (or nested folder) under `destDir`.

Second case: no matching asset → `ToolDownloadFailed`.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test` in `packages/patch`

Expected: FAIL

- [ ] **Step 3: Implement ToolPlatform + GithubRelease**

- [ ] **Step 4: Run tests**

Run: `vp test` then `vp check --fix` in `packages/patch`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/patch/src/ToolPlatform.ts packages/patch/src/GithubRelease.ts packages/patch/src/GithubRelease.test.ts packages/patch/src/index.ts
git commit -m "feat(patch): download and unpack GitHub release tool zips"
```

---

### Task 6: ToolCache

**Files:**

- Create: `packages/patch/src/ToolCache.ts`
- Create: `packages/patch/src/ToolCache.test.ts`

**Interfaces:**

- Consumes: `CachePaths`, `GithubRelease`, `ToolPlatform`, `FileSystem`, `Path`
- Produces `ToolCache` `@gimped/patch/ToolCache`:
  - `ensureDepotDownloader(root: string): Effect<string, ToolDownloadFailed | IoError>` — path to `DepotDownloader.exe` or `DepotDownloader`
  - `ensureJpexs(root: string): Effect<JpexsLaunch, ToolDownloadFailed | IoError>`

```ts
type JpexsLaunch =
  | { readonly kind: "cli"; readonly path: string }
  | { readonly kind: "script"; readonly path: string }
  | { readonly kind: "jar"; readonly path: string };
```

Find files with `readDirectory(dir, { recursive: true })` + `path.basename`.

Depot present: basename `DepotDownloader.exe` (win32) or `DepotDownloader` (else). If missing, `github.downloadLatestAsset(DEPOT_REPO, depotToolDir, name => name === expectedZip)` then search again.

Expected zip from platform: `DepotDownloader-windows-x64.zip`, `DepotDownloader-linux-x64.zip`, `DepotDownloader-macos-arm64.zip`, `DepotDownloader-macos-x64.zip`.

JPEXS present: prefer `ffdec-cli.exe`, else `ffdec.bat` / `ffdec.sh` by OS, else `ffdec.jar`. If none, download asset matching `/^ffdec_\d+\.\d+\.\d+\.zip$/` (not nightly).

If binary exists **do not** call `GithubRelease`.

- [ ] **Step 1: Write the failing test**

Two Effect tests with a mock `GithubRelease` layer (`Layer.succeed` / `Layer.sync` recording `calls: string[]`):

1. Write a fake `DepotDownloader.exe` under `tools/depotdownloader/` — `ensureDepotDownloader` returns that path and `calls` stays `[]`.
2. Empty tool dir — mock `downloadLatestAsset` writes the exe, then ensure returns it and `calls` is `[DEPOT_REPO]`.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test` in `packages/patch`

Expected: FAIL

- [ ] **Step 3: Implement ToolCache**

- [ ] **Step 4: Run tests**

Run: `vp test` then `vp check --fix` in `packages/patch`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/patch/src/ToolCache.ts packages/patch/src/ToolCache.test.ts packages/patch/src/index.ts
git commit -m "feat(patch): cache DepotDownloader and JPEXS binaries"
```

---

### Task 7: DepotClient

**Files:**

- Create: `packages/patch/src/DepotClient.ts`
- Create: `packages/patch/src/DepotClient.test.ts`

**Interfaces:**

- Consumes: `ToolCache`, `FileSystem`, `Path`, `ChildProcessSpawner`, `Config`
- Produces `DepotClient` `@gimped/patch/DepotClient`:
  - `parseManifestId(output: string): Effect<string, DepotDownloadFailed>`
  - `resolvePublicManifest(root: string): Effect<string, MissingSteamCredentials | DepotDownloadFailed | ToolDownloadFailed | IoError>`
  - `download(root: string, manifestId: string, full: boolean): Effect<void, MissingSteamCredentials | DepotDownloadFailed | ToolDownloadFailed | IoError>`

`parseManifestId`: first match `/Manifest (\d+) \(/` else `/Already have manifest (\d+) for depot/`. Else `DepotDownloadFailed`.

Credentials: `Config.string("STEAM_USERNAME")` and `Config.string("STEAM_PASSWORD")`. Map missing/empty to `MissingSteamCredentials`. Pass `-username`, `-password`, `-remember-password`, `-app`, `-depot`, `-os windows`.

`resolvePublicManifest`: ensure binary, `makeDirectory` a temp resolve dir under `path.join(root, "resolve")`, spawn with `-manifest-only -dir <that>`. `stdin: "inherit"`, stdout/stderr piped and concatenated. Non-zero → `DepotDownloadFailed` with snippet. Parse id.

`download`: write `filelist.txt` next to depot dir unless `full`. Spawn with `-manifest <id> -dir <depotDir>` and `-filelist` when not full. Inherit stdin/stdout/stderr. Non-zero → `DepotDownloadFailed`.

- [ ] **Step 1: Write the failing test**

Unit-test `parseManifestId` via the live service (no spawn):

- `"Manifest 555 (1/1/2020)"` → `"555"`
- `"Already have manifest 777 for depot 291551."` → `"777"`
- `"nope"` → `DepotDownloadFailed`

Add a mock-`ToolCache` test that `resolvePublicManifest` fails `MissingSteamCredentials` when Config map is empty (do not spawn).

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test` in `packages/patch`

Expected: FAIL

- [ ] **Step 3: Implement DepotClient**

Collect process output:

```ts
const handle =
  yield * ChildProcess.make(bin, args, { stdin: "inherit", stdout: "pipe", stderr: "pipe" });
const chunks: Uint8Array[] = [];
yield * Stream.runForEach(handle.all, (chunk) => Effect.sync(() => chunks.push(chunk)));
const code = yield * handle.exitCode;
const text = new TextDecoder().decode(concat(chunks));
```

Wrap spawn in `Effect.scoped`. `concat` = allocate `Uint8Array` of total length and copy.

- [ ] **Step 4: Run tests**

Run: `vp test` then `vp check --fix` in `packages/patch`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/patch/src/DepotClient.ts packages/patch/src/DepotClient.test.ts packages/patch/src/index.ts
git commit -m "feat(patch): wrap DepotDownloader manifest resolve and download"
```

---

### Task 8: Ffdec

**Files:**

- Create: `packages/patch/src/Ffdec.ts`
- Create: `packages/patch/src/Ffdec.test.ts`

**Interfaces:**

- Consumes: `ToolCache`, `FileSystem`, `Path`, `ChildProcessSpawner`
- Produces `Ffdec` `@gimped/patch/Ffdec`:
  - `findSwf(depotDir: string): Effect<string, MissingSwf | IoError>` — basename path. Prefer `BrawlhallaAir.swf` case-insensitive; else exactly one `*.swf`; else `MissingSwf`
  - `exportScripts(root: string, depotDir: string, scriptsDir: string): Effect<string, MissingJava | FfdecFailed | MissingSwf | ToolDownloadFailed | IoError>` — returns SWF basename. `ensureJpexs`. If launch is `script` or `jar`, spawn `java -version` first (ignore stdout; spawn/non-zero → `MissingJava`). Then:
    - `cli`: `[path, "-export", "script", scriptsDir, swfPath]`
    - `script`: `[path, "-export", "script", scriptsDir, swfPath]`
    - `jar`: `["java", "-jar", path, "-export", "script", scriptsDir, swfPath]`
      Inherit stdio. Non-zero → `FfdecFailed`. `makeDirectory(scriptsDir, { recursive: true })` first.

- [ ] **Step 1: Write the failing test**

`findSwf` only (no spawn): temp depot with `BrawlhallaAir.swf` + `other.swf` → Air; only `foo.swf` → foo; two non-Air swfs → `MissingSwf`; empty → `MissingSwf`. Provide a dummy `ToolCache` layer.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test` in `packages/patch`

Expected: FAIL

- [ ] **Step 3: Implement Ffdec**

- [ ] **Step 4: Run tests**

Run: `vp test` then `vp check --fix` in `packages/patch`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/patch/src/Ffdec.ts packages/patch/src/Ffdec.test.ts packages/patch/src/index.ts
git commit -m "feat(patch): locate Brawlhalla SWF and export scripts with FFDec"
```

---

### Task 9: Pipeline

**Files:**

- Create: `packages/patch/src/pipeline.ts`
- Create: `packages/patch/src/pipeline.test.ts`
- Create: `packages/patch/src/layers.ts`
- Modify: `packages/patch/src/index.ts`

**Interfaces:**

- Consumes: all services above
- Produces `Pipeline` `@gimped/patch/Pipeline`:
  - `fetch(options: FetchOptions): Effect<PatchRegistry, PatchError>`

```ts
export type FetchOptions = {
  readonly cacheDir?: string;
  readonly manifestId?: string;
  readonly full: boolean;
  readonly versionKeysPath?: string;
};
```

`PatchError` = union of all tagged errors + `IoError` + `MalformedJson`.

Skip rules after `ensureDepotDownloader` + `ensureJpexs` + manifest id known:

1. `readPatch` yields a registry → return it; if `manifestId` was omitted (public), `writePatch` again with `publicLatest: true` so `latestManifestId` refreshes (same registry fields)
2. Else if SWF exists in depot and `scripts/` has any `.as` → extract + write
3. Else if SWF exists in depot → FFDec + extract + write
4. Else download → FFDec + extract + write

`files`: `readDirectory(depotDir)` basenames ending `.swf`/`.swz` (non-recursive is enough; if empty after `--full`, still include the chosen SWF basename).

`static Default` merges every service layer (like ANM `Pipeline.Default`). `layers.ts`: `TestLive = Pipeline.Default.pipe(Layer.provideMerge(NodeServices.layer), Layer.provideMerge(FetchHttpClient.layer))`. Export `layer = Pipeline.Default` and `fetch` helper.

- [ ] **Step 1: Write the failing test**

```ts
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
  ensureDepotDownloader: () => Effect.succeed("DepotDownloader.exe"),
  ensureJpexs: () => Effect.succeed({ kind: "jar" as const, path: "ffdec.jar" }),
});

const MockDepot = Layer.succeed(DepotClient, {
  parseManifestId: (output: string) => Effect.succeed("123"),
  resolvePublicManifest: () => Effect.succeed("123"),
  download: () =>
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
  Layer.provide(KeyExtractor.layer),
  Layer.provide(VersionRegistry.layer),
  Layer.provide(CachePaths.layer),
  Layer.provideMerge(NodeServices.layer),
);

layer(AppLive)("Pipeline.fetch", (it) => {
  it.effect("skips download and ffdec when registry exists", () =>
    Effect.gen(function* () {
      counts.download = 0;
      counts.export = 0;
      const fs = yield* FileSystem.FileSystem;
      const paths = yield* CachePaths;
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
```

Fix the SWF write to **only** `path.join(depot, "BrawlhallaAir.swf")` (delete the broken `replaceAll` line). Mock layers must match the real service shapes from Tasks 6–8. `Pipeline.layer` here means `Pipeline.Default` without live Depot/Ffdec/ToolCache — provide mocks instead of those Default pieces. If `Default` always includes live DepotClient, define `Pipeline.layer` as the orchestrator-only layer (needs `ToolCache | DepotClient | Ffdec | KeyExtractor | VersionRegistry | CachePaths | FileSystem | Path`) and put live implementations in `Pipeline.Default`. Tests use `Pipeline.layer` + mocks.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test` in `packages/patch`

Expected: FAIL

- [ ] **Step 3: Implement Pipeline + layers + export `fetch`**

- [ ] **Step 4: Run tests**

Run: `vp test` then `vp check --fix` in `packages/patch`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/patch/src/pipeline.ts packages/patch/src/pipeline.test.ts packages/patch/src/layers.ts packages/patch/src/index.ts
git commit -m "feat(patch): orchestrate cached fetch, extract, and registry writes"
```

---

### Task 10: `@gimped/patch-cli`

**Files:**

- Create: `packages/patch-cli/package.json`
- Create: `packages/patch-cli/tsconfig.json`
- Create: `packages/patch-cli/vite.config.ts`
- Create: `packages/patch-cli/src/bin.ts`
- Create: `packages/patch-cli/src/cli.ts`
- Create: `packages/patch-cli/src/commands/fetch.ts`
- Create: `packages/patch-cli/src/cli.test.ts`
- Modify: `tsconfig.json` (add `{ "path": "./packages/patch-cli" }`)

**Interfaces:**

- Consumes: `fetch` / `PatchRegistryText` / `layer` from `@gimped/patch`
- Produces bin `patch`, command `fetch [--manifest] [--full] [--cache-dir] [--version-keys]`

- [ ] **Step 1: Scaffold CLI package**

`package.json` like `packages/anm-cli` with name `@gimped/patch-cli`, bin `patch` → `./src/bin.ts`, dependency `@gimped/patch`. Copy anm-cli `tsconfig.json` / `vite.config.ts`. `vp i` from workspace root. Add tsconfig reference.

- [ ] **Step 2: Write the failing test**

```ts
it("exposes fetch subcommand", () => {
  expect(
    root.subcommands.flatMap((group) => group.commands.map((command) => command.name)),
  ).toEqual(["fetch"]);
});
```

Do **not** run a real Steam fetch in CI.

- [ ] **Step 3: Run test to verify it fails**

Run: `vp test` in `packages/patch-cli`

Expected: FAIL

- [ ] **Step 4: Implement CLI**

`commands/fetch.ts`: `Flag.string("manifest").pipe(Flag.optional)`, `Flag.boolean("full").pipe(Flag.withDefault(false))`, `Flag.string("cache-dir").pipe(Flag.optional)`, `Flag.string("version-keys").pipe(Flag.optional)`.

Handler: `versionKeysPath` = option, else `packages/swz/src/version-keys.json` relative to `process.cwd()` if `fs.exists`. Call `fetch({ cacheDir, manifestId, full, versionKeysPath })`. Print `Schema.encodeUnknownSync(PatchRegistryText)(registry)` plus newline (`Console.log`).

`cli.ts`: `Command.make("patch").pipe(Command.withDescription("Brawlhalla patch fetch"), Command.withSubcommands([fetchCmd]))`.

`bin.ts`: `layer` from `@gimped/patch` provided with `NodeServices.layer` **and** `FetchHttpClient.layer` (`import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"`). `NodeRuntime.runMain(Command.run(root, { version: "0.0.0" }).pipe(Effect.provide(AppLive)))`.

- [ ] **Step 5: Run tests and check**

Run: `vp test` and `vp check --fix` in `packages/patch-cli`, then `vp check --fix` in `packages/patch`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/patch-cli tsconfig.json pnpm-lock.yaml
git commit -m "feat(patch-cli): add patch fetch command"
```

---

## Self-review (spec coverage)

| Spec requirement                                                               | Task   |
| ------------------------------------------------------------------------------ | ------ |
| Packages `@gimped/patch` + `@gimped/patch-cli`                                 | 1, 10  |
| Cache root flag / `GIMPED_CACHE` / OS default                                  | 2      |
| Tool download in-pipeline, no-op if present                                    | 6      |
| GitHub latest zips + `tar -xf`                                                 | 5      |
| App 291550 / depot 291551 / windows / filelist / `--full`                      | 7      |
| Env Steam credentials + `-remember-password`                                   | 7      |
| Manifest parse + public resolve                                                | 7      |
| FFDec `-export script`, Java check                                             | 8      |
| Init + `vs "<id>"` parse                                                       | 3      |
| registry.json + index.json + version-keys merge / `latest` rules / KeyConflict | 4      |
| Skip rules                                                                     | 9      |
| CLI flags + print registry                                                     | 10     |
| Offline tests                                                                  | 3–10   |
| Electron out of scope                                                          | (none) |
