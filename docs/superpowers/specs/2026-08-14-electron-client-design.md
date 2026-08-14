# Electron desktop client — Design

Date: 2026-08-14  
Status: approved (pending user review of this written spec)

prefer effect native modules  
do not use vanilla js functions, use Effect.gen or Effect.fn  
make each module an Effect Layer

Follow `.repos/effect/LLMS.md` and shipped `effect` / `@effect/*` `AGENTS.md`. Foldkit renderer follows `.repos/foldkit/AGENTS.md` (Messages as past-tense facts, Schema models, Commands / Subscriptions / ManagedResource by lifetime). IPC follows `.repos/effect-electron-example` ported to Effect v4 (`effect/unstable/rpc`, `Context.Service`, `ManagedRuntime`).

## Goal

Add a repo-run Electron desktop shell (`apps/client`, package `@gimped/client`) whose first working screen fetches a Brawlhalla Steam patch with live per-step progress.

- Main process: TypeScript + Effect (RpcServer, `@gimped/patch` pipeline).
- Renderer: TypeScript + Effect + Foldkit (no React, no effect-atom).
- Typesafe IPC: one Schema RPC contract over a MessagePort (MsgPack), as in the Effect Electron example, using Effect v4 APIs.

The shell is meant to grow (SWZ / replay / ANM later). v1 ships sidebar chrome for those tools as coming-soon, plus Patch and Settings.

## Out of scope

- Installer / electron-builder / packaged distribution
- SWZ, replay, or ANM screens (sidebar entries only, not selectable)
- Reading `STEAM_USERNAME` / `STEAM_PASSWORD` from env or `.env` in the app (CLI still does)
- Fake 0–100 bars when a tool does not report a fraction
- CLI progress UI (unary `fetch` remains)
- Auto-updating tools when a newer GitHub release exists
- Downloading a JRE (Java must already be on `PATH`)

This spec **extends** `@gimped/patch`. It supersedes the patch-pipeline spec’s “Electron out of scope” and “`--force` later” notes for the library API. It does not add `patch-cli` flags for force/clear in v1.

## Context

`@gimped/patch` today: `fetch(options) → PatchRegistry`, no progress stream, DepotDownloader download inherits stdio (CLI Steam Guard + terminal progress), credentials from Effect Config (`STEAM_*`).

The Effect Electron example (v3: `@effect/rpc`, React, effect-atom) shows MessagePort RPC, port handoff per renderer load, MsgPack, `supportsTransferables: false` (Electron cannot transfer ArrayBuffers). v4: RPC lives in `effect/unstable/rpc`; services are `Context.Service`; `ManagedRuntime` still exists for a long-lived main-process layer.

Foldkit Commands return one Message. A progress stream is a **Subscription** gated by Model, not a long Command. Cancel is a Model change that drops the Subscription (interrupts the RPC stream).

## Architecture

```
packages/patch          # stream, credentials, force, clear — source of truth
apps/client             # @gimped/client — Electron main + Foldkit renderer
```

`pnpm-workspace.yaml` includes `apps/*`. Root `tsconfig.json` references `apps/client`.

```
main (Node)                          preload                    renderer (DOM)
ManagedRuntime                       relay MessagePort          Foldkit app
  RpcServer(ClientRpcs)              on "rpc-port"              RpcClient(ClientRpcs)
    Pipeline.Default                                            Subscriptions / Commands
    SteamCredentials ← safeStorage
    SteamGuard ← Deferred
    MessagePort protocol (MsgPack)
```

On every `did-finish-load`, main mints a `MessageChannelMain`, binds one port to the long-lived server, transfers the other. Reload interrupts in-flight streams.

**Where types live**

- `@gimped/patch` owns `PatchEvent`, `FetchOptions` (including `force`), `clearPatch`, `SteamCredentials`, `SteamGuard`, pipeline steps, and tagged errors. Schema is the wire format for patch events/errors.
- `apps/client/src/shared` owns `ClientRpcs`. Settings is an app concern; the library does not import the app.

**Toolchain**

`electron-vite` for main / preload / renderer, `@foldkit/vite-plugin` on the renderer. `vp check`, `vp test`, `vp run` from the package. `electron` and `electron-vite` are app dependencies (add to workspace catalog only if other packages need them). Dev: `vp run --filter @gimped/client start` (electron-vite). No pack/installer.

## Packages

### `@gimped/patch`

Keep existing skip rules, cache layout, and error tags. Add:

#### `SteamCredentials`

`Context.Service` with `username` and `password` (non-empty strings). CLI live layer: Config/`STEAM_*` as today (missing → `MissingSteamCredentials`). App live layer: Electron `safeStorage`. Tests: succeed layer.

Pipeline and `DepotClient` read this service, not Config directly.

#### `SteamGuard`

`Context.Service` with `requestCode: Effect<string, PatchError>`. Called when DepotDownloader stdout matches a Steam Guard prompt.

`fetchStream` itself emits `SteamGuardRequired`, then calls `requestCode` (so the UI can show the field before the fiber blocks).

- CLI layer: read one line from stdin (terminal). Unary `fetch` ignores the `SteamGuardRequired` chunk.
- App layer: wait on a `Deferred` completed by `SubmitSteamGuard`.
- Tests: succeed with a fixed code.

#### `PatchEvent`

Tagged Schema union (library + RPC success chunks):

| Tag                  | Fields                                                                           |
| -------------------- | -------------------------------------------------------------------------------- |
| `StepStarted`        | `step: PatchStep`                                                                |
| `StepSkipped`        | `step: PatchStep`, `reason: string`                                              |
| `StepProgress`       | `step: PatchStep`, `fraction: Option<number>` (0–1 when known), `detail: string` |
| `SteamGuardRequired` | (no fields)                                                                      |
| `Completed`          | `registry: PatchRegistry`                                                        |

Stream failure is `PatchError`, not a `Failed` event.

`PatchStep` literal tags: `EnsureDepotDownloader`, `EnsureJpexs`, `ResolveManifest`, `DownloadDepot`, `ExportScripts`, `ExtractKeys`, `WriteRegistry`.

`StepProgress.fraction` is `None` when the tool does not report a usable fraction. UI must not invent a percentage.

#### `FetchOptions`

```ts
type FetchOptions = {
  readonly cacheDir?: string;
  readonly manifestId?: string;
  readonly full: boolean;
  readonly force: boolean;
  readonly versionKeysPath?: string;
};
```

`force: true` ignores skip short-circuits: do not return an existing `registry.json`; do not skip DepotDownloader because `depot/` has a SWF; do not skip FFDec because `scripts/` has `.as`. Tools ensure still no-ops if binaries are present. `force: false` is today’s skip table.

#### `Pipeline`

- `fetchStream(options): Stream<PatchEvent, PatchError>` — public API. Internally a scoped `PatchReporter` (mailbox) is provided for the run; `Pipeline`, `DepotClient`, `GithubRelease`, `Ffdec`, and `KeyExtractor` `emit` into it. The Stream is that mailbox until the pipeline fiber ends, then a final `Completed` or a stream failure. Reporter is not a public alternative to `fetch`.
- `fetch(options): Effect<PatchRegistry, PatchError>` — drain `fetchStream`, return the `Completed` registry (CLI and tests).
- `clearPatch(root, manifestId): Effect<void, IoError>` — delete `patches/<manifestId>/` recursively. Missing directory is success (idempotent). Do not delete `$CACHE/tools/` or `index.json` (stale index entry for that id is allowed; next successful fetch upserts). The library does not resolve “latest” — the caller passes a concrete id.

`submitSteamGuard` is not a Pipeline method. The app RpcServer completes the `SteamGuard` Deferred. The library only exposes the service.

#### Child processes and progress

`DepotClient` **pipes** stdout/stderr for both `-manifest-only` and download (no `inherit` for those streams). Parse lines:

- Manifest id: existing `Manifest <id> (` / `Already have manifest <id>` patterns.
- Progress: DepotDownloader percent / bytes lines → `StepProgress` with `fraction` when a percent is parsed; otherwise `detail` only.
- Steam Guard: known prompt text → `SteamGuard.requestCode()`, write the code plus newline to child stdin.

Unparseable lines are ignored (optionally reflected in `detail` for the current step). Do not fail the fetch.

`GithubRelease` asset download: if `Content-Length` is present, emit `StepProgress` from received bytes / length while writing the zip. Unpack (`tar -xf`) may have no fraction (`StepStarted` + running `detail`).

`Ffdec` / key extract: file counts when cheap (files exported / `.as` scanned); otherwise no fraction.

#### Interrupt cleanup

If a `fetchStream` fiber is interrupted (renderer cancel, port swap, window close) and the run has a known `manifestId` whose `registry.json` does not decode, delete `patches/<manifestId>/`. If `registry.json` already exists, leave the cache. Tools cache is never deleted by fetch, cancel, or clear.

A **failed** fetch (not interrupt) leaves whatever is on disk; the user uses Clear or Force.

### `@gimped/patch-cli`

Unary `fetch` still prints `PatchRegistry` JSON. Pass `force: false`. No progress UI, no `clear` subcommand, no `--force` in v1. Provide `SteamCredentials` from Config and `SteamGuard` from stdin. Internally may call `fetch` (which drains the stream).

### `@gimped/client` (`apps/client`)

```
apps/client/
  src/
    shared/           # ClientRpcs + settings schemas
    main/             # window, RpcServer, handlers, steam-store, ipc-server
    preload/          # relay rpc-port → window.postMessage
    renderer/         # Foldkit shell, Patch + Settings submodels
```

#### RPC (`ClientRpcs`)

| Procedure          | Kind   | Payload                                      | Success                                      | Error                             |
| ------------------ | ------ | -------------------------------------------- | -------------------------------------------- | --------------------------------- |
| `PatchFetch`       | stream | renderer fetch fields (below)                | `PatchEvent`                                 | `PatchError` \| `FetchInProgress` |
| `PatchClear`       | unary  | `{ manifestId?: string, cacheDir?: string }` | `void`                                       | `IoError` \| `NothingToClear`     |
| `SubmitSteamGuard` | unary  | `{ code: string }`                           | `void`                                       | `SteamGuardNotPending`            |
| `SettingsGet`      | unary  | —                                            | `{ username: string, hasPassword: boolean }` | `SafeStorageFailed`               |
| `SettingsSet`      | unary  | `{ username: string, password: string }`     | `void`                                       | `SafeStorageFailed`               |

Renderer payload for fetch: optional `manifestId`, `full`, optional `cacheDir` (empty string means omitted), `force`. Main adds `versionKeysPath` when resolved. `PatchClear` uses the same optional `cacheDir` as the form so Clear hits the cache the user is looking at.

One in-flight `PatchFetch`. A second call fails `FetchInProgress`. `RpcServer.layer(..., { disableFatalDefects: true })`.

#### version-keys path

Main does **not** assume `process.cwd()` is the repo root (electron-vite often starts in `apps/client`). Walk up from `process.cwd()` and from `app.getAppPath()` until `pnpm-workspace.yaml` is found; if `packages/swz/src/version-keys.json` exists under that root, pass it as `versionKeysPath`. Otherwise omit (no merge).

#### Settings / `safeStorage`

After `app.whenReady()`, encrypt JSON `{ username, password }` with `safeStorage.encryptString` and write `steam-credentials.bin` under `app.getPath("userData")`. `SettingsGet` never returns the password: `hasPassword` is whether a stored password exists. Missing file → `{ username: "", hasPassword: false }`, not an error. Password field in the UI is local form state; clear it after a successful save. Steam Guard codes are not persisted.

`SettingsSet` requires non-empty username and password (renderer validation; main also rejects empty). If `safeStorage.isEncryptionAvailable()` is false, `SettingsSet` / decrypt of an existing file fail `SafeStorageFailed`.

#### Foldkit renderer

Shell Model: `{ screen: Patch | Settings, patch: Patch.Model, settings: Settings.Model }`.

Sidebar: Patch (selected), Settings, then SWZ / Replay / ANM listed and not selectable (click does not change `screen`). No URL router.

RpcClient is provided in the Foldkit application Layer for the renderer lifetime. Reload → new port → new app.

**Patch Model** is a tagged union, not booleans:

- `Idle`
- `Running` — options, `steps` (per-step started/skipped/progress), optional Guard input string
- `Succeeded` — `PatchRegistry` plus last step list
- `Failed` — tagged error plus last step list
- `Cancelled`

Form fields (manifest, full, cache dir, force) live on the Patch submodel even while `Idle`, so they survive a run.

**Fetch:** `ClickedFetch` → `Running` with a new `runId`. Subscription depends only on `{ runId }` (not the step list), so progress updates do not restart the stream. Stream = `PatchFetch` RPC; chunks → `GotPatchEvent`. Leaving `Running` closes the scope and interrupts the RPC. Switching to Settings does **not** leave `Running`.

**Cancel:** `ClickedCancel` → `Cancelled`. No cancel RPC. Main interrupt + incomplete-dir cleanup as above.

**Guard:** `SteamGuardRequired` → show code field on the Patch screen. `ClickedSubmitGuard` → unary `SubmitSteamGuard` Command.

**Clear:** unary `PatchClear`. Disabled while `Running`. Manifest from the form; if empty, main uses `index.json` `latestManifestId` under the resolved cache root; if still missing → `NothingToClear`.

**Settings:** boot `SettingsGet`. Save `SettingsSet`. Fetch reads credentials on main at stream start; missing → `MissingSteamCredentials` on the stream.

Only one fetch at a time. Fetch and Clear disabled while `Running`; Cancel only while `Running`.

## New errors

Existing `PatchError` tags keep their `message` (and other) fields. New tags use `detail` instead of `message` so the field does not shadow `Error.prototype.message` on the RPC boundary.

| Tag                    | When                                                  |
| ---------------------- | ----------------------------------------------------- |
| `NothingToClear`       | Clear with empty manifest and no `latestManifestId`   |
| `SafeStorageFailed`    | Encryption unavailable, or encrypt/decrypt/IO failed  |
| `FetchInProgress`      | Second `PatchFetch` while one is running              |
| `SteamGuardNotPending` | `SubmitSteamGuard` with no in-flight Guard `Deferred` |

`NothingToClear`, `SafeStorageFailed`, `FetchInProgress`, and `SteamGuardNotPending` live in `apps/client/src/shared`. The library does not raise them.

## Data flow (summary)

1. User saves Settings → `safeStorage` file.
2. User clicks Fetch → renderer `Running` → `PatchFetch` stream on main → `fetchStream` with credentials + version-keys path.
3. Events update the step list. Guard event shows the code field; submit writes child stdin.
4. `Completed` → `Succeeded`. Stream error → `Failed`.
5. Cancel → `Cancelled` → Subscription drop → interrupt → maybe delete incomplete `patches/<id>/`.

## Testing

Offline only. No real Steam, GitHub, Java, FFDec, or Electron window.

**`@gimped/patch`** (`@effect/vitest`, mock layers)

- `PatchEvent` Schema round-trip
- DepotDownloader percent / Guard-prompt parsers; junk lines ignored
- `force: true` re-runs download + FFDec when registry exists; `force: false` keeps skip rules
- `clearPatch` deletes `patches/<id>/`, leaves `tools/`
- Interrupt with no `registry.json` deletes `patches/<id>/`; interrupt after a written registry leaves it
- Unary `fetch` still returns `PatchRegistry`
- Steam Guard: mock prompt, `requestCode` unblocks, stream reaches `Completed`
- `SteamCredentials` from a test layer, not env

**`apps/client`**

- RPC contract tags; MsgPack round-trip for `PatchEvent` and settings payloads
- Transport: unary, stream, port-swap interruption over Node `MessageChannel` (no Electron)
- Handlers via `RpcTest.makeClient`: stream order, `FetchInProgress`, Guard submit, clear, settings with fake `safeStorage`
- Foldkit story tests: Idle → Running → progress → Succeeded; Failed; Cancelled; Guard field on `SteamGuardRequired`; coming-soon sidebar clicks do not change `screen`. Mock RpcClient in the app Layer.

**`patch-cli`**

- Still exposes `fetch` only.

## Success criteria

1. `vp check --fix` and `vp test` pass for `patch`, `patch-cli`, and `client`.
2. `vp run --filter @gimped/client start` opens the shell; Settings can save credentials; Fetch shows per-step status and real fractions when tools report them.
3. Cached patch: Fetch skips work (`StepSkipped` / quick `Completed`) unless Force or Clear.
4. Cancel of an incomplete download removes `patches/<id>/`.
5. Unary `patch fetch` still prints a registry when the cache is complete (no GitHub/Steam).

## Implementation order

One spec, two sequenced slices (library first so the app has a stream to RPC):

1. `@gimped/patch` (+ `patch-cli` `force: false` compile fix): reporter, `fetchStream`, credentials/guard services, `force`, `clearPatch`, parsers, interrupt cleanup, tests.
2. `apps/client`: workspace `apps/*`, electron-vite, MessagePort RPC v4, handlers, Foldkit shell, tests.
