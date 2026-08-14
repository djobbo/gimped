# `@gimped/patch`

Cached pipeline that, for one Brawlhalla Steam patch, installs tools if needed, downloads the depot, exports ActionScript with FFDec, and records client build id + SWZ key. The CLI is [`@gimped/patch-cli`](../patch-cli).

Steam app `291550`, Windows content depot `291551`. DepotDownloader is not anonymous for this app.

## `fetch` / `fetchStream` / `clearPatch`

```ts
import { clearPatch, fetch, fetchStream, type FetchOptions } from "@gimped/patch";

type FetchOptions = {
  readonly cacheDir?: string;
  readonly manifestId?: string; // omit → current public depot
  readonly full: boolean;
  readonly force: boolean;
  readonly versionKeysPath?: string; // omit → do not touch version-keys.json
};
```

Provide `layer` (`Pipeline.Default`) with Node services, `HttpClient` (CLI uses `FetchHttpClient`), `SteamCredentials`, and `SteamGuard`. `fetch` returns a `PatchRegistry`. `fetchStream` yields `PatchEvent`s (step start/skip/progress, Steam Guard, then `Completed`). Unary `fetch` drains that stream.

`force: false` skips work whose outputs already exist. `force: true` still ensures tools if present, but does not return an existing `registry.json` and does not skip download/FFDec because depot/scripts already exist.

`clearPatch(root, manifestId)` deletes `patches/<manifestId>/` (missing directory is success). It does not delete `$CACHE/tools/` or `index.json`.

Steps:

1. Ensure DepotDownloader and JPEXS under the cache (GitHub latest zip if the binary/`ffdec.jar` is missing; no-op if present). Does not auto-update a present install.
2. Resolve manifest id (`--manifest`, or DepotDownloader `-manifest-only`).
3. If `force: false` and `registry.json` already decodes, return it (still refresh `latestManifestId` on a public fetch; emit `StepSkipped` for later steps).
4. Otherwise download into `patches/<id>/depot` (default filelist: `*.swf` / `*.swz`; `full: true` takes the whole depot), export scripts with FFDec, scan `.as` for `ANE_RawData.Init(<digits>)` and `vs "<digits>"`.

If a `fetchStream` fiber is interrupted and the run has a known manifest whose `registry.json` does not decode, `patches/<id>/` is deleted.

## Cache

Root, first match: `cacheDir`, `GIMPED_CACHE`, `%LOCALAPPDATA%/gimped`, `~/.cache/gimped`.

```
$CACHE/tools/depotdownloader/
$CACHE/tools/jpexs/
$CACHE/patches/<manifestId>/depot/
$CACHE/patches/<manifestId>/scripts/
$CACHE/patches/<manifestId>/registry.json
$CACHE/index.json
```

`version-keys.json` merge (when `versionKeysPath` is set): `keys[clientBuild] = swzKey`; `aliases.latest` only on a public-branch fetch. A different existing key is `KeyConflict`.

## Services

| Module             | Role                                                                 |
| ------------------ | -------------------------------------------------------------------- |
| `CachePaths`       | Cache root and well-known subpaths                                   |
| `ToolCache`        | `ensureDepotDownloader` / `ensureJpexs`                              |
| `GithubRelease`    | `releases/latest` + asset download                                   |
| `DepotClient`      | Spawn DepotDownloader; resolve public manifest                       |
| `Ffdec`            | `-export script`; SWF is `BrawlhallaAir.swf` or the sole `*.swf`     |
| `KeyExtractor`     | Init key + build id from exported `.as`                              |
| `VersionRegistry`  | `registry.json`, `index.json`, key-map merge                         |
| `SteamCredentials` | `get` → `{ username, password }`. CLI: `layerFromConfig` (`STEAM_*`) |
| `SteamGuard`       | `requestCode` when DepotDownloader prompts. CLI: `layerStdin`        |
| `PatchReporter`    | Internal `PatchEvent` emit (mailbox for `fetchStream`)               |
| `Pipeline`         | `fetch` / `fetchStream` / `clearPatch`                               |

## Errors

| Tag                         | When                                               |
| --------------------------- | -------------------------------------------------- |
| `MissingSteamCredentials`   | `STEAM_USERNAME` or `STEAM_PASSWORD` empty         |
| `ToolDownloadFailed`        | GitHub / unpack failed                             |
| `MissingJava`               | `java` not on `PATH` before FFDec                  |
| `DepotDownloadFailed`       | Non-zero DepotDownloader or no manifest id parsed  |
| `FfdecFailed`               | Non-zero FFDec                                     |
| `MissingSwf`                | No usable SWF in `depot/`                          |
| `KeyNotFound`               | No `Init`, or conflicting Init values              |
| `BuildIdNotFound`           | No checksum `vs "<digits>"` (or fallback)          |
| `KeyConflict`               | Key map already has a different key for this build |
| `IoError` / `MalformedJson` | From `@gimped/common`                              |
