# Brawlhalla patch fetch pipeline — Design

Date: 2026-08-14  
Status: approved (pending user review of this written spec)

prefer effect native modules
do not use vanilla js functions, use Effect.gen or Effect.fn
make each module in the patch package an Effect Layer

make sure to follow `.repos/effect/LLMS.md` and shipped `effect` / `@effect/*` `AGENTS.md` for best practices

## Goal

Add a cached pipeline that, for one Brawlhalla Steam patch:

1. Ensures DepotDownloader and JPEXS (FFDec) are on disk (GitHub release download if missing; no-op if present)
2. Downloads that patch (SWF + SWZ by default, full depot with `--full`)
3. Exports ActionScript with FFDec
4. Reads client build id and SWZ key from the export
5. Writes a per-patch `registry.json`, a global cache `index.json`, and merges into `packages/swz/src/version-keys.json`

Two packages, same split as SWZ / ANM:

1. `@gimped/patch` — Effect library
2. `@gimped/patch-cli` — Effect v4 CLI wrapping that library

Electron / desktop UI is **out of scope**. The library is the API a later desktop app will call.

## Out of scope

- Electron app, GUI, RPC
- Compiling DepotDownloader or JPEXS from `.repos` (clones are CLI/docs source of truth only)
- Downloading a JRE (Java must already be on `PATH`)
- `--force` re-fetch (add later if needed)
- Auto-updating tools when a newer GitHub release exists (present binary → skip GitHub)

## Context

Steam: Brawlhalla app `291550`, Windows content depot `291551`. DepotDownloader is not anonymous for this app.

From `brawlhalla-src/dump/scripts`:

- SWZ key: `ANE_RawData.Init(762411009)` in `class_316.as`
- Client build: quoted `"10090"` in checksum/version strings (`class_60.as`: `vs "10090"`)

`.repos/DepotDownloader` and `.repos/jpexs-decompiler` define flags and log lines. Runtime binaries come from GitHub releases into the cache.

## Architecture

```
packages/
  patch/          # @gimped/patch
  patch-cli/      # @gimped/patch-cli
```

Scaffold like existing packages (Vite+, `vp test` / `vp build` / `vp check`, `effect` and `@effect/platform-node` from catalog). Root `tsconfig.json` references both.

Cache root, first match wins:

1. `--cache-dir` (CLI) / `cacheDir` (library)
2. `GIMPED_CACHE`
3. Windows: `%LOCALAPPDATA%/gimped`; elsewhere: `~/.cache/gimped`

```
$CACHE/
  tools/
    depotdownloader/     # unpacked GitHub zip; skip download if binary exists
    jpexs/               # unpacked ffdec zip; skip if ffdec.jar / launcher exists
  patches/
    <steamManifestId>/
      depot/             # DepotDownloader -dir
      scripts/           # FFDec -export script
      registry.json
  index.json
```

Tool install is a **pipeline step**, not a separate command.

## Packages

### `@gimped/patch`

Each module is a `Context.Service` + `Layer`. Prefer `FileSystem` / `Path` / `HttpClient` / `ChildProcess` over Node built-ins. Schema for all JSON.

| Module            | Responsibility                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `CachePaths`      | Resolve cache root and well-known subpaths                                                   |
| `ToolCache`       | `ensureDepotDownloader` / `ensureJpexs`: return binary path; download+unpack only if missing |
| `GithubRelease`   | `releases/latest` + asset download (used only by `ToolCache`)                                |
| `DepotClient`     | Spawn cached DepotDownloader; resolve public manifest; download into `depot/`                |
| `Ffdec`           | Spawn cached FFDec `-export script`                                                          |
| `KeyExtractor`    | Scan exported `.as` for Init key + build id                                                  |
| `VersionRegistry` | Read/write `registry.json`, `index.json`; merge `version-keys.json`                          |
| `Pipeline`        | `fetch(options) → PatchRegistry`; skip steps whose outputs already exist                     |

`NodeServices.layer` does **not** include `HttpClient`. Live layer provides `NodeHttpClient` (fetch) plus `NodeServices`.

Public API: `fetch(options: FetchOptions): Effect<PatchRegistry, PatchError, …>`.

```ts
type FetchOptions = {
  readonly cacheDir?: string;
  readonly manifestId?: string; // omit → current public depot
  readonly full: boolean;
  readonly versionKeysPath?: string; // omit → do not touch version-keys.json
};
```

CLI always passes `versionKeysPath` when `packages/swz/src/version-keys.json` exists relative to cwd.

### `@gimped/patch-cli`

Bin `patch`. One subcommand:

```
patch fetch [--manifest <id>] [--full] [--cache-dir <path>] [--version-keys <path>]
```

Reads `STEAM_USERNAME`, `STEAM_PASSWORD`, `GIMPED_CACHE`. Prints the resulting `PatchRegistry` as JSON (Schema encode).

## Tool cache

**DepotDownloader:** `GET https://api.github.com/repos/SteamRE/DepotDownloader/releases/latest` with a `User-Agent`. Pick the zip for host OS/arch (`DepotDownloader-windows-x64.zip`, `DepotDownloader-linux-x64.zip`, `DepotDownloader-macos-arm64.zip`, `DepotDownloader-macos-x64.zip`). No matching asset → `ToolDownloadFailed`. Unpack with `tar -xf` into `$CACHE/tools/depotdownloader`. Present if `DepotDownloader.exe` (Windows) or `DepotDownloader` exists anywhere under that directory (zips may nest one folder); invoke that path.

**JPEXS:** `GET https://api.github.com/repos/jindrapetrik/jpexs-decompiler/releases/latest`. Asset `ffdec_<version>.zip` (not nightly). Unpack into `$CACHE/tools/jpexs`. Present if `ffdec.jar` exists anywhere under that directory. Invoke `ffdec-cli.exe` if present, else `ffdec.bat` (Windows) / `ffdec.sh` (Unix), else `java -jar ffdec.jar`. Java on `PATH` is required whenever the launcher is not a self-contained exe; if `java` is missing then, fail `MissingJava` before spawning FFDec.

If the present check succeeds, **do not** call GitHub.

## DepotDownloader

Always:

- `-app 291550 -depot 291551 -os windows -dir <depotDir> -remember-password`
- `-username` / `-password` from `STEAM_USERNAME` / `STEAM_PASSWORD`
- Inherit stdin/stdout/stderr (Steam Guard, progress)

If either env var is missing or empty → `MissingSteamCredentials` (do not try anonymous).

Default file list (not `--full`), written next to the download as `filelist.txt`:

```
regex:.*\.swf$
regex:.*\.swz$
```

Pass `-filelist <that path>`. `--full` omits `-filelist`.

**Resolve public manifest** (when `--manifest` omitted): run with `-manifest-only` (same app/depot/os/auth). Parse stdout for `Manifest <id> (` (see `ContentDownloader.cs`). Also accept `Already have manifest <id> for depot 291551`. Fail `DepotDownloadFailed` if no id. Then treat that id as `--manifest`.

**Cache key** is the Steam manifest id string. Download `-dir` is `$CACHE/patches/<id>/depot`.

Non-zero exit → `DepotDownloadFailed` with a stderr/stdout snippet.

## FFDec

From JPEXS `help.txt`:

```
-export script <scriptsDir> <swfPath>
```

SWF path: `BrawlhallaAir.swf` under `depot/` (case-insensitive). If missing, exactly one `*.swf`; otherwise `MissingSwf`.

## Key extraction

Scan `scripts/**/*.as` (recursive):

1. **SWZ key:** all `ANE_RawData.Init(<digits>)` captures. Zero matches → `KeyNotFound`. More than one distinct uint32 → `KeyNotFound` (ambiguous). One distinct value → that key `>>> 0`.
2. **Build id:** first `vs "<digits>"` (checksum message in `class_60`). If none, first `gameVersion` comparison with a quoted digit string. Still none → `BuildIdNotFound`.

Do not treat identifiers like `var_10090` as the build id.

## Registries

Per-patch `$CACHE/patches/<manifestId>/registry.json`:

```json
{
  "steamAppId": 291550,
  "steamDepotId": 291551,
  "steamManifestId": "1234567890",
  "fullDepot": false,
  "clientBuild": "10090",
  "swzKey": 762411009,
  "swf": "BrawlhallaAir.swf",
  "files": ["BrawlhallaAir.swf", "Game.swz"]
}
```

`files` is the list of `.swf` / `.swz` basenames under `depot/` (even when `fullDepot` is true). `swf` is the basename passed to FFDec.

`$CACHE/index.json`:

```json
{
  "latestManifestId": "1234567890",
  "patches": {
    "1234567890": {
      "clientBuild": "10090",
      "swzKey": 762411009,
      "fetchedAt": "2026-08-14T10:00:00.000Z"
    }
  }
}
```

`latestManifestId` is updated only when this run resolved the **public** branch (no `--manifest`). A historical `--manifest` fetch still upserts `patches[id]`.

`version-keys.json` merge (only if `versionKeysPath` is set):

- Set `keys[clientBuild] = swzKey`
- If that build already has a **different** key → `KeyConflict`
- Set `aliases.latest = clientBuild` only on a public-branch fetch
- Schema round-trip with existing `VersionKeyMap` (`keys` + `aliases`); preserve other aliases

This is a different file from SWZ per-archive `registry.json` (entry filetypes + seed).

## Pipeline skip rules

After tools are ensured and the manifest id is known:

| Condition                           | Action                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `registry.json` exists and decodes  | Return it; still refresh `index.json` `latestManifestId` on public fetch |
| `depot/` has the SWF, no `scripts/` | Skip DepotDownloader; run FFDec + parse + write                          |
| `scripts/` present, no registry     | Skip download + FFDec; parse + write                                     |
| Otherwise                           | Download → FFDec → parse → write                                         |

A decoded `registry.json` is the definition of a complete patch. Do not re-download because Steam still has that manifest.

## Errors

`Schema.TaggedError` in `packages/patch/src/errors.ts`. Reuse `@gimped/common` `IoError` / `MalformedJson` for file/JSON failures.

| Tag                       | When                                                   |
| ------------------------- | ------------------------------------------------------ |
| `MissingSteamCredentials` | `STEAM_USERNAME` or `STEAM_PASSWORD` empty             |
| `ToolDownloadFailed`      | GitHub / unpack failed                                 |
| `MissingJava`             | `java` not on `PATH` before FFDec                      |
| `DepotDownloadFailed`     | Non-zero DepotDownloader or no manifest id parsed      |
| `FfdecFailed`             | Non-zero FFDec                                         |
| `MissingSwf`              | No usable SWF in `depot/`                              |
| `KeyNotFound`             | No Init, or conflicting Init values                    |
| `BuildIdNotFound`         | No checksum `vs "<digits>"` (or fallback)              |
| `KeyConflict`             | `version-keys.json` has a different key for this build |

## Testing

All tests offline (`@effect/vitest`, mock layers). No real Steam, GitHub, Java, or FFDec.

- `KeyExtractor`: fixture snippets with `ANE_RawData.Init(762411009)` and `vs "10090"`; fail on zero/ambiguous Init and missing build
- `VersionRegistry`: temp-dir round-trip of `registry.json` / `index.json`; merge into a temp `version-keys.json`; `latest` alias only on public fetch; `KeyConflict`
- `ToolCache`: binary already on disk → `HttpClient` not called; missing → mock release JSON + zip bytes
- `Pipeline`: mock `DepotClient` / `Ffdec` / `ToolCache`; complete registry → no download; depot without scripts → FFDec only
- CLI: `fetch` is registered (same style as `swz-cli`)

## Success criteria

1. `vp check --fix` and `vp test` pass for `patch` and `patch-cli`
2. `patch fetch` with tools + patch already cached returns the registry without GitHub or Steam
3. A real run (manual) produces `clientBuild` + `swzKey` that round-trip with `@gimped/swz` on that patch’s `Game.swz`
4. Public fetch updates `version-keys.json` `keys` and `aliases.latest`; `--manifest` of an older patch adds `keys` only
