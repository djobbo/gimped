# Electron Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `@gimped/patch` with a progress stream, credentials/guard services, force, and clear; add `apps/client` (`@gimped/client`) — an Electron + Foldkit shell that fetches a patch with live per-step progress.

**Architecture:** Library stream is the source of truth (`fetchStream` + internal `PatchReporter`). Electron main is an Effect v4 RpcServer over a MessagePort (ported from `.repos/effect-electron-example`; use `Queue` not v3 `Mailbox`). Renderer is Foldkit: fetch is a Subscription gated by `runId`; Settings persist Steam creds via `safeStorage`.

**Tech Stack:** Effect `4.0.0-rc.109` (catalog), `effect/unstable/rpc`, `@effect/platform-node`, `@gimped/patch`, Foldkit + `@foldkit/vite-plugin` + `@foldkit/ui`, Electron + `electron-vite`, Vitest via Vite+ (`vp test`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-14-electron-client-design.md`
- Follow `.repos/effect/LLMS.md` and shipped `effect` `AGENTS.md`: `Effect.fn("Name")` + `Effect.gen`; services via `Context.Service` + `static layer`; JSON/wire via `Schema` (no `JSON.parse` / `JSON.stringify`)
- Foldkit renderer follows `.repos/foldkit/AGENTS.md`: Messages are past-tense facts; `Match.tagsExhaustive`; Commands return one Message; progress stream is a **Subscription**; `index.ts` is a barrel
- IPC follows `.repos/effect-electron-example` ported to v4: `import { Rpc, RpcGroup, RpcClient, RpcServer, RpcSerialization, RpcTest } from "effect/unstable/rpc"`; `Context.Service` not `Context.Tag`; `Queue` instead of `Mailbox`; `supportsTransferables: false`; MsgPack; port handoff per `did-finish-load`; `disableFatalDefects: true`
- No `node:fs` in library or main (use `FileSystem` / `Path`). Electron `safeStorage` / `app` / `BrowserWindow` / `MessageChannelMain` are allowed in `apps/client/src/main`
- Use `vp` (not pnpm/npm/yarn). After each task: `vp check --fix` and `vp test` in the affected package, then commit
- Offline tests only. No real Steam, GitHub, Java, FFDec, or Electron window
- Do **not** mix unrelated dirty files (`packages/patch/src/Ffdec.ts`, `ToolCache.ts`, `constants.ts` FFDec memory work) into these commits unless they are already on the branch
- v3 `Mailbox` does not exist in Effect v4 — use `Queue.unbounded` + `Stream.fromQueue` / `Stream.callback`
- `StepProgress.fraction` is `Schema.optionalKey(Schema.Number)` (omit = unknown). Never invent 0–100
- App does not read `STEAM_*` env. CLI still does via `SteamCredentials.layerFromConfig`

## File structure

| File | Role |
| --- | --- |
| `packages/patch/src/schemas.ts` | Add `PatchStep`, `PatchEvent` variants |
| `packages/patch/src/progress.ts` | Pure parsers: percent line, Steam Guard prompt |
| `packages/patch/src/PatchReporter.ts` | Internal emit service |
| `packages/patch/src/SteamCredentials.ts` | username/password service |
| `packages/patch/src/SteamGuard.ts` | `requestCode` service |
| `packages/patch/src/pipeline.ts` | `force`, `fetchStream`, `clearPatch`, interrupt cleanup |
| `packages/patch/src/DepotClient.ts` | Pipe stdio, emit progress, call SteamGuard |
| `packages/patch/src/GithubRelease.ts` | Byte progress when Content-Length present |
| `packages/patch/src/Ffdec.ts` | Optional running detail / file-count progress |
| `packages/patch/src/KeyExtractor.ts` | Optional file-count progress |
| `packages/patch/src/layers.ts` | Provide credentials/guard/reporter defaults |
| `packages/patch-cli/src/bin.ts` | Provide Config credentials + stdin guard |
| `packages/patch-cli/src/commands/fetch.ts` | Pass `force: false` |
| `apps/client/**` | Electron app |
| `pnpm-workspace.yaml` | Add `apps/*` |
| `tsconfig.json` | Reference `apps/client` |

`apps/client/src` layout:

```
shared/client-rpc.ts      ClientRpcs + app errors + settings schemas
shared/rpc-client.ts      renderer RpcClient.Protocol over MessagePort
main/ipc-server.ts        RpcServer.Protocol + RpcPortHandoff (v4 Queue)
main/steam-store.ts       safeStorage file
main/workspace.ts         walk up to pnpm-workspace.yaml
main/handlers.ts          Rpc handlers
main/index.ts             ManagedRuntime + BrowserWindow
preload/index.ts          relay rpc-port
renderer/client-api.ts    Context.Service the Foldkit app yields
renderer/client-api-live.ts
renderer/patch/patch.ts   Patch submodel
renderer/patch/index.ts
renderer/settings/settings.ts
renderer/settings/index.ts
renderer/main.ts          shell Model / update / view / subscriptions
renderer/entry.ts
renderer/index.html
renderer/styles.css
```

---

### Task 1: `PatchStep` / `PatchEvent` schemas

**Files:**

- Modify: `packages/patch/src/schemas.ts`
- Create: `packages/patch/src/schemas.events.test.ts`
- Modify: `packages/patch/src/index.ts` (already exports schemas)

**Interfaces:**

- Consumes: existing `PatchRegistry`
- Produces:
  - `PatchStep` = `Schema.Literals(["EnsureDepotDownloader", "EnsureJpexs", "ResolveManifest", "DownloadDepot", "ExportScripts", "ExtractKeys", "WriteRegistry"])`
  - `StepStarted`, `StepSkipped`, `StepProgress`, `SteamGuardRequired`, `Completed` as `Schema.TaggedStruct`
  - `PatchEvent` = union of those
  - `StepProgress.fraction` optional 0–1 number (omit when unknown)

- [ ] **Step 1: Write the failing test**

`packages/patch/src/schemas.events.test.ts`:

```ts
import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import {
  Completed,
  PatchEvent,
  StepProgress,
  StepStarted,
  SteamGuardRequired,
} from "./schemas.ts";

it("round-trips StepStarted", () => {
  const event = { _tag: "StepStarted" as const, step: "DownloadDepot" as const };
  const encoded = Schema.encodeSync(StepStarted)(event);
  expect(Schema.decodeSync(StepStarted)(encoded)).toEqual(event);
});

it("round-trips StepProgress without fraction", () => {
  const event = {
    _tag: "StepProgress" as const,
    step: "ExportScripts" as const,
    detail: "running",
  };
  expect(Schema.decodeSync(StepProgress)(Schema.encodeSync(StepProgress)(event))).toEqual(event);
});

it("round-trips StepProgress with fraction", () => {
  const event = {
    _tag: "StepProgress" as const,
    step: "DownloadDepot" as const,
    fraction: 0.45,
    detail: "45.00% BrawlhallaAir.swf",
  };
  expect(Schema.decodeSync(StepProgress)(Schema.encodeSync(StepProgress)(event))).toEqual(event);
});

it("PatchEvent union accepts Completed and SteamGuardRequired", () => {
  const guard = { _tag: "SteamGuardRequired" as const };
  expect(Schema.decodeSync(PatchEvent)(Schema.encodeSync(PatchEvent)(guard))).toEqual(guard);
  const completed = {
    _tag: "Completed" as const,
    registry: {
      steamAppId: 291550,
      steamDepotId: 291551,
      steamManifestId: "1",
      fullDepot: false,
      clientBuild: "10090",
      swzKey: 762411009,
      swf: "BrawlhallaAir.swf",
      files: ["BrawlhallaAir.swf"],
    },
  };
  expect(Schema.decodeSync(Completed)(Schema.encodeSync(Completed)(completed))).toEqual(completed);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test --filter @gimped/patch`

Expected: FAIL resolving `PatchEvent` / `StepStarted` exports.

- [ ] **Step 3: Add schemas**

Append to `packages/patch/src/schemas.ts` (keep existing `PatchRegistry` / `PatchIndex`):

```ts
export const PatchStep = Schema.Literals([
  "EnsureDepotDownloader",
  "EnsureJpexs",
  "ResolveManifest",
  "DownloadDepot",
  "ExportScripts",
  "ExtractKeys",
  "WriteRegistry",
]);
export type PatchStep = typeof PatchStep.Type;

export const StepStarted = Schema.TaggedStruct("StepStarted", {
  step: PatchStep,
});
export const StepSkipped = Schema.TaggedStruct("StepSkipped", {
  step: PatchStep,
  reason: Schema.String,
});
export const StepProgress = Schema.TaggedStruct("StepProgress", {
  step: PatchStep,
  fraction: Schema.optionalKey(Schema.Number),
  detail: Schema.String,
});
export const SteamGuardRequired = Schema.TaggedStruct("SteamGuardRequired", {});
export const Completed = Schema.TaggedStruct("Completed", {
  registry: PatchRegistry,
});
export const PatchEvent = Schema.Union([
  StepStarted,
  StepSkipped,
  StepProgress,
  SteamGuardRequired,
  Completed,
]);
export type PatchEvent = typeof PatchEvent.Type;
```

- [ ] **Step 4: Run tests**

Run: `vp test --filter @gimped/patch`

Expected: PASS (including existing tests).

- [ ] **Step 5: Commit**

```bash
git add packages/patch/src/schemas.ts packages/patch/src/schemas.events.test.ts
git commit -m "feat(patch): add PatchEvent schemas for pipeline progress"
```

---

### Task 2: Progress parsers + `PatchReporter`

**Files:**

- Create: `packages/patch/src/progress.ts`
- Create: `packages/patch/src/progress.test.ts`
- Create: `packages/patch/src/PatchReporter.ts`
- Create: `packages/patch/src/PatchReporter.test.ts`
- Modify: `packages/patch/src/index.ts` (export `progress.ts` and `PatchReporter.ts`)

**Interfaces:**

- Consumes: `PatchEvent` from Task 1
- Produces:
  - `parseDepotPercent(line: string): number | undefined` — first `NN` or `NN.NN` immediately before `%` (DepotDownloader prints `{0,6:#00.00}% {path}`); clamp to 0–1
  - `isSteamGuardPrompt(line: string): boolean` — true if line includes `This account is protected by Steam Guard.` OR `Please enter your 2 factor auth code` OR `Please enter the authentication code sent to your email`
  - `PatchReporter` service: `{ emit: (event: PatchEvent) => Effect.Effect<void> }`
  - `PatchReporter.noop` layer (emit is `Effect.void`)
  - `PatchReporter.collecting()` test helper: layer + `Ref<ReadonlyArray<PatchEvent>>`

- [ ] **Step 1: Write failing parser tests**

`packages/patch/src/progress.test.ts`:

```ts
import { expect, it } from "@effect/vitest";
import { isSteamGuardPrompt, parseDepotPercent } from "./progress.ts";

it("parses DepotDownloader percent lines", () => {
  expect(parseDepotPercent(" 45.00% BrawlhallaAir.swf")).toBe(0.45);
  expect(parseDepotPercent("100.00% Game.swz")).toBe(1);
  expect(parseDepotPercent("nope")).toBeUndefined();
});

it("detects Steam Guard prompts", () => {
  expect(isSteamGuardPrompt("This account is protected by Steam Guard.")).toBe(true);
  expect(isSteamGuardPrompt("Please enter your 2 factor auth code from your authenticator app: ")).toBe(
    true,
  );
  expect(isSteamGuardPrompt("Please enter the authentication code sent to your email address: ")).toBe(
    true,
  );
  expect(isSteamGuardPrompt(" 45.00% BrawlhallaAir.swf")).toBe(false);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `vp test --filter @gimped/patch`

Expected: FAIL missing `./progress.ts`.

- [ ] **Step 3: Implement parsers**

`packages/patch/src/progress.ts`:

```ts
const PERCENT = /(\d+(?:\.\d+)?)\s*%/;

export const parseDepotPercent = (line: string): number | undefined => {
  const match = line.match(PERCENT);
  if (match?.[1] === undefined) {
    return undefined;
  }
  const value = Number(match[1]) / 100;
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return Math.min(1, Math.max(0, value));
};

export const isSteamGuardPrompt = (line: string): boolean =>
  line.includes("This account is protected by Steam Guard.") ||
  line.includes("Please enter your 2 factor auth code") ||
  line.includes("Please enter the authentication code sent to your email");
```

- [ ] **Step 4: Write failing reporter test**

`packages/patch/src/PatchReporter.test.ts`:

```ts
import { expect, it } from "@effect/vitest";
import { Effect, Layer, Ref } from "effect";
import { PatchReporter } from "./PatchReporter.ts";
import type { PatchEvent } from "./schemas.ts";

it.effect("collecting reporter records emits", () =>
  Effect.gen(function* () {
    const events = yield* Ref.make<ReadonlyArray<PatchEvent>>([]);
    const layer = Layer.succeed(PatchReporter, {
      emit: (event) => Ref.update(events, (current) => [...current, event]),
    });
    yield* PatchReporter.pipe(
      Effect.flatMap((reporter) =>
        reporter.emit({ _tag: "StepStarted", step: "DownloadDepot" }),
      ),
      Effect.provide(layer),
    );
    expect(yield* Ref.get(events)).toEqual([{ _tag: "StepStarted", step: "DownloadDepot" }]);
  }),
);
```

If `@effect/vitest` `it.effect` must be imported from `@effect/vitest` the same way other patch tests use `layer(AppLive)` — use `it.effect` from `@effect/vitest` (see `errors.test.ts` style). If `it.effect` is not a top-level export, wrap with `layer(Layer.empty)` or `Effect.runPromise` matching existing files.

- [ ] **Step 5: Implement PatchReporter**

`packages/patch/src/PatchReporter.ts`:

```ts
import { Context, Effect, Layer } from "effect";
import type { PatchEvent } from "./schemas.ts";

export class PatchReporter extends Context.Service<
  PatchReporter,
  {
    readonly emit: (event: PatchEvent) => Effect.Effect<void>;
  }
>()("@gimped/patch/PatchReporter") {
  static readonly noop: Layer.Layer<PatchReporter> = Layer.succeed(PatchReporter, {
    emit: (_event) => Effect.void,
  });
}
```

Export from `index.ts`.

- [ ] **Step 6: Run tests + check + commit**

Run: `vp check --fix --filter @gimped/patch` then `vp test --filter @gimped/patch`

Expected: PASS.

```bash
git add packages/patch/src/progress.ts packages/patch/src/progress.test.ts packages/patch/src/PatchReporter.ts packages/patch/src/PatchReporter.test.ts packages/patch/src/index.ts
git commit -m "feat(patch): add progress parsers and PatchReporter"
```

---

### Task 3: `SteamCredentials` + `SteamGuard` services

**Files:**

- Create: `packages/patch/src/SteamCredentials.ts`
- Create: `packages/patch/src/SteamCredentials.test.ts`
- Create: `packages/patch/src/SteamGuard.ts`
- Create: `packages/patch/src/SteamGuard.test.ts`
- Modify: `packages/patch/src/DepotClient.ts` — replace `readSteamCredential` / Config with `yield* SteamCredentials`
- Modify: `packages/patch/src/DepotClient.test.ts` — provide a credentials layer instead of empty Config for the missing-creds case
- Modify: `packages/patch/src/layers.ts` — `Pipeline.Default` requires these; CLI will provide live layers in Task 6
- Modify: `packages/patch/src/index.ts`

**Interfaces:**

- Consumes: `MissingSteamCredentials`
- Produces:
  - `SteamCredentials` `{ username: string; password: string }` (both already non-empty)
  - `SteamCredentials.layerFromConfig` — `Config.string("STEAM_USERNAME")` / `STEAM_PASSWORD`, option + trim empty → `MissingSteamCredentials`
  - `SteamGuard` `{ requestCode: Effect.Effect<string, never> }`
  - `SteamGuard.succeed(code: string)` test layer
  - `SteamGuard.layerStdin` — read one line from `Stdio` (implement in this task or Task 6; if Stdio line-read is awkward, implement stdin layer in Task 6 with CLI)

DepotClient currently reads Config internally. After this task, `DepotClient.layer` requires `SteamCredentials`. `credentials()` becomes `yield* SteamCredentials`.

Missing-creds test: provide `SteamCredentials` layer that fails `MissingSteamCredentials` OR provide `layerFromConfig` with empty ConfigProvider (same as today).

- [ ] **Step 1: Write failing credentials test**

`packages/patch/src/SteamCredentials.test.ts`:

```ts
import { expect, layer } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import { MissingSteamCredentials } from "./errors.ts";
import { SteamCredentials } from "./SteamCredentials.ts";

const withConfig = (record: Record<string, string>) =>
  SteamCredentials.layerFromConfig.pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(record))),
  );

layer(withConfig({ STEAM_USERNAME: "user", STEAM_PASSWORD: "pass" }))(
  "SteamCredentials.layerFromConfig",
  (it) => {
    it.effect("reads username and password", () =>
      Effect.gen(function* () {
        const creds = yield* SteamCredentials;
        expect(creds.username).toBe("user");
        expect(creds.password).toBe("pass");
      }),
    );
  },
);

layer(withConfig({}))("SteamCredentials missing", (it) => {
  it.effect("fails MissingSteamCredentials", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(SteamCredentials);
      expect(result._tag).toBe("Failure");
    }),
  );
});
```

Note: `Context.Service` as a yieldable that loads from Config may need to be `Layer.effect` that fails at layer build. Prefer **methods** instead of putting Effect in the service value:

```ts
export class SteamCredentials extends Context.Service<
  SteamCredentials,
  {
    readonly get: Effect.Effect<{ readonly username: string; readonly password: string }, MissingSteamCredentials>;
  }
>()("@gimped/patch/SteamCredentials")
```

DepotClient: `const { username, password } = yield* creds.get`.

- [ ] **Step 2: Run to fail**

Run: `vp test --filter @gimped/patch`

Expected: FAIL missing module.

- [ ] **Step 3: Implement SteamCredentials and SteamGuard**

`SteamGuard.ts`:

```ts
export class SteamGuard extends Context.Service<
  SteamGuard,
  {
    readonly requestCode: Effect.Effect<string>;
  }
>()("@gimped/patch/SteamGuard") {
  static readonly succeed = (code: string): Layer.Layer<SteamGuard> =>
    Layer.succeed(SteamGuard, { requestCode: Effect.succeed(code) });
}
```

`layerFromConfig` uses the same empty-check logic currently in `DepotClient.readSteamCredential` (move that function into `SteamCredentials.ts`).

- [ ] **Step 4: Switch DepotClient to SteamCredentials**

Remove `readSteamCredential` and `Config` usage from `DepotClient.ts`. Add `SteamCredentials` to the service layer requirements. `credentials()` = `yield* (yield* SteamCredentials).get` (or `const steam = yield* SteamCredentials; return yield* steam.get`).

Update `DepotClient.test.ts` AppLive: `Layer.provideMerge(SteamCredentials.layerFromConfig)` and keep the empty ConfigProvider test.

Update `Pipeline.Default` / `DepotClient.layer` types so they require `SteamCredentials`. Tests that construct `Pipeline.layer` with mock DepotClient do **not** need real credentials (mock Depot does not yield SteamCredentials). Tests that use `DepotClient.layer` do.

- [ ] **Step 5: Tests + check + commit**

Run: `vp check --fix --filter @gimped/patch` then `vp test --filter @gimped/patch`

Expected: PASS. Existing `fails MissingSteamCredentials when Config map is empty` still passes.

```bash
git add packages/patch/src/SteamCredentials.ts packages/patch/src/SteamCredentials.test.ts packages/patch/src/SteamGuard.ts packages/patch/src/SteamGuard.test.ts packages/patch/src/DepotClient.ts packages/patch/src/DepotClient.test.ts packages/patch/src/layers.ts packages/patch/src/index.ts
git commit -m "feat(patch): extract SteamCredentials and SteamGuard services"
```

---

### Task 4: `force`, `fetchStream`, `clearPatch`, interrupt cleanup

**Files:**

- Modify: `packages/patch/src/pipeline.ts`
- Modify: `packages/patch/src/pipeline.test.ts`
- Modify: `packages/patch/src/layers.ts`
- Modify: `packages/patch-cli/src/commands/fetch.ts` (add `force: false` so the CLI still typechecks)
- Modify: every `fetch({ ... })` call site that lacks `force`

**Interfaces:**

- Consumes: `PatchReporter`, `PatchEvent`, `SteamCredentials` (not needed if Depot is mocked), `CachePaths`
- Produces:
  - `FetchOptions.force: boolean` (required, like `full`)
  - `Pipeline.fetchStream(options): Stream<PatchEvent, PatchError>`
  - `Pipeline.fetch` drains the stream and returns `Completed.registry` (fail if the stream ends without `Completed`)
  - `Pipeline.clearPatch(root, manifestId): Effect<void, IoError>`
  - `force: true` does not return early on existing registry; does not skip download/FFDec because depot/scripts exist
  - `force: false` keeps today’s skip table, but emit `StepSkipped` when skipping a step
  - On interrupt, if `manifestId` is known and `registry.json` does not decode, delete `patches/<id>/`

**fetchStream shape (use this, do not invent another):**

```ts
const fetchStream = Effect.fn("Pipeline.fetchStream")(function* (options: FetchOptions) {
  return Stream.callback<PatchEvent, PatchError>((queue) =>
    Effect.gen(function* () {
      const reporter = PatchReporter.of({
        emit: (event) => queue.offer(event),
      });
      const registry = yield* runFetch(options).pipe(
        Effect.provideService(PatchReporter, reporter),
        Effect.onInterrupt(() => maybeDeleteIncomplete(options)),
      );
      yield* queue.offer({ _tag: "Completed", registry });
    }),
  );
});
```

If `Stream.callback` queue.offer types disagree, use `Stream.unwrapScoped` + `Queue.unbounded` + `Stream.fromQueue` + `Effect.forkScoped` of `runFetch`, then `Queue.shutdown` after `Completed`. Check `.repos/effect` `Stream.ts` for `callback`.

`runFetch` is the current `fetch` body, plus:

1. `yield* reporter.emit({ _tag: "StepStarted", step: "EnsureDepotDownloader" })` before each ensure (or skip with `StepSkipped` if you detect present — optional; started + immediate continue is fine for tool ensure)
2. Before returning existing registry when `!options.force`: emit `StepSkipped` for DownloadDepot, ExportScripts, ExtractKeys, WriteRegistry as appropriate, then return
3. When `options.force`: skip those early returns

`maybeDeleteIncomplete`: resolve root + manifestId (from options or a `Ref` written after resolve). If `versions.readPatch` is undefined, `fs.remove(paths.patchDir(root, id), { recursive: true })` catching NotFound.

`clearPatch`: `fs.remove(paths.patchDir(root, manifestId), { recursive: true })` catching NotFound → success.

Export `clearPatch` as `Effect.fn` that yields `Pipeline` like `fetch`.

- [ ] **Step 1: Extend pipeline tests (failing)**

Add to `packages/patch/src/pipeline.test.ts` (keep mocks). All `fetch({ cacheDir, full: false })` become `fetch({ cacheDir, full: false, force: false })`.

New cases:

1. `force: true` with existing registry still calls download + export (reset counts; expect download >= 1 and export >= 1). Mock download should write a SWF if export needs it — the existing FFDec mock writes scripts. Current skip when registry exists never calls download; force must call them. Mock `download` should create `depot/BrawlhallaAir.swf` so later steps work, or the pipeline with force ignores registry and goes to `!hasSwf` → download.

2. `fetchStream` yields a `Completed` whose registry matches unary `fetch`.

3. `clearPatch` deletes `patches/123/` including `registry.json` but leaves `tools/depotdownloader/x`.

4. Interrupt: `download` mock = `Effect.interrupt` after writing nothing; run `fetchStream` in a fiber and interrupt; expect `patches/123` gone. For a known manifest, pass `manifestId: "123"` in options so cleanup knows the id without resolve. If interrupt happens before resolve, cleanup is a no-op (allowed).

Collect stream: `Stream.runCollect` from `effect`.

- [ ] **Step 2: Run to fail**

Run: `vp test --filter @gimped/patch`

Expected: FAIL (`force` not on FetchOptions / `fetchStream` missing).

- [ ] **Step 3: Implement pipeline + CLI `force: false`**

Also update `packages/patch-cli/src/commands/fetch.ts` so `vp check` on the workspace typechecks:

```ts
const registry = yield* fetch({
  cacheDir: Option.getOrUndefined(config.cacheDir),
  manifestId: Option.getOrUndefined(config.manifest),
  full: config.full,
  force: false,
  versionKeysPath,
});
```

Do not add `--force` CLI flag (spec: out of scope).

- [ ] **Step 4: Tests + check + commit**

Run: `vp check --fix --filter @gimped/patch --filter @gimped/patch-cli` then `vp test --filter @gimped/patch --filter @gimped/patch-cli`

Expected: PASS.

```bash
git add packages/patch/src/pipeline.ts packages/patch/src/pipeline.test.ts packages/patch/src/layers.ts packages/patch-cli/src/commands/fetch.ts
git commit -m "feat(patch): stream fetch, force rerun, and clearPatch"
```

---

### Task 5: Depot / GitHub / FFDec emit real progress

**Files:**

- Modify: `packages/patch/src/DepotClient.ts`
- Modify: `packages/patch/src/DepotClient.test.ts`
- Modify: `packages/patch/src/GithubRelease.ts`
- Modify: `packages/patch/src/GithubRelease.test.ts` (if present)
- Modify: `packages/patch/src/Ffdec.ts`
- Modify: `packages/patch/src/KeyExtractor.ts`
- Modify: `packages/patch/src/pipeline.ts` (emit `SteamGuardRequired` immediately before `requestCode`)

**Interfaces:**

- Consumes: `PatchReporter`, `SteamGuard`, `parseDepotPercent`, `isSteamGuardPrompt`
- Produces: piped DepotDownloader stdio; `StepProgress` for percent lines; Steam Guard: emit `SteamGuardRequired`, `yield* guard.requestCode`, write code + `\n` to child stdin; GitHub download `StepProgress` on `EnsureDepotDownloader` / `EnsureJpexs` using received/total when `Content-Length` exists

**DepotClient download/resolve:** stop using `stdout: "inherit"` for download. Use the existing `runPiped` pattern for **both**. While tapping chunks, decode incremental text, split lines, for each line:

```ts
if (isSteamGuardPrompt(line)) {
  const reporter = yield* PatchReporter;
  yield* reporter.emit({ _tag: "SteamGuardRequired" });
  const guard = yield* SteamGuard;
  const code = yield* guard.requestCode;
  yield* handle.stdin.write(new TextEncoder().encode(`${code}\n`));
}
const fraction = parseDepotPercent(line);
yield* reporter.emit({
  _tag: "StepProgress",
  step: currentStep, // ResolveManifest vs DownloadDepot
  ...(fraction === undefined ? {} : { fraction }),
  detail: line.trim(),
});
```

`handle.stdin` must exist: `ChildProcess.make(..., { stdin: "pipe", stdout: "pipe", stderr: "pipe" })`. If the Effect ChildProcess stdin API differs, read `.repos/effect/packages/effect/src/unstable/process/ChildProcess.ts` and use that API (do not invent).

Add `SteamGuard` + `PatchReporter.noop` to `DepotClient.layer` requirements. Tests provide `SteamGuard.succeed("12345")` and `PatchReporter.noop`.

**GithubRelease:** if `HttpClientResponse` exposes a body stream, fold chunks and emit progress with `step` passed in — **do not** change `downloadLatestAsset` signature to require a step if that ripples too far. Instead `yield* PatchReporter` inside download and emit `EnsureDepotDownloader` only when the reporter is the mailbox (noop otherwise). Emitting the wrong step during JPEXS download is acceptable if the pipeline wraps ensureJpexs with `StepStarted EnsureJpexs` first; prefer adding an optional `step: PatchStep` argument to `downloadLatestAsset`.

**Ffdec / KeyExtractor:** emit `StepProgress` with `detail` file counts (`n` `.as` files) and no fraction unless a count/total is trivial (`i / asFiles.length`).

- [ ] **Step 1: Parser already tested. Add DepotClient unit tests for line handling if you extract `onDepotLine` as a pure function** (preferred): `onDepotLine(line, step)` returns `{ kind: "guard" } | { kind: "progress", event: PatchEvent } | { kind: "ignore" }`. Test that in `progress.test.ts` or `DepotClient.test.ts`. Then DepotClient just interprets those tags.

- [ ] **Step 2: Implement piping + emits**

- [ ] **Step 3: Tests + check + commit**

Run: `vp check --fix --filter @gimped/patch` then `vp test --filter @gimped/patch`

Expected: PASS. No network.

```bash
git add packages/patch/src/DepotClient.ts packages/patch/src/DepotClient.test.ts packages/patch/src/GithubRelease.ts packages/patch/src/Ffdec.ts packages/patch/src/KeyExtractor.ts packages/patch/src/pipeline.ts packages/patch/src/progress.ts packages/patch/src/progress.test.ts
git commit -m "feat(patch): pipe tool output into PatchEvent progress"
```

---

### Task 6: CLI layers + patch README

**Files:**

- Modify: `packages/patch-cli/src/bin.ts`
- Modify: `packages/patch/src/layers.ts`
- Modify: `packages/patch/README.md` (document `fetchStream`, `force`, `clearPatch`, `SteamCredentials`; remove “Electron out of scope”)
- Modify: `packages/patch-cli/README.md` (unchanged flags; note `force: false`)
- Modify: root `README.md` only if fetch API snippet would be wrong

**Interfaces:**

- `SteamGuard.layerStdin`: `Effect.fn` that reads one line from `Stdio` / `process.stdin` via Effect platform. If no line helper exists, `Effect.promise(() => readline)` is **not** allowed — use `Stdio` + `Stream.take(1)` + decode, or `FileSystem` read of `/dev/stdin` is wrong on Windows. Prefer `effect/unstable/process` or NodeServices Stdio. Look up `Stdio` in `.repos/effect`. Fallback: `ChildProcess` is already piping for DepotDownloader; CLI `requestCode` can use `Effect.fn` wrapping `stdin` from `Stdio.Stdio` if it has `readLine`. If none exists, implement a small `readLineStdin` with `Effect.async` + `process.stdin.once("data")` **only in the CLI package**, not the library.

`packages/patch-cli/src/bin.ts`:

```ts
const AppLive = layer.pipe(
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(FetchHttpClient.layer),
  Layer.provideMerge(dotEnvLayer.pipe(Layer.provide(NodeServices.layer))),
  Layer.provideMerge(SteamCredentials.layerFromConfig),
  Layer.provideMerge(SteamGuard.layerStdin),
  Layer.provideMerge(PatchReporter.noop),
);
```

If `Pipeline.Default` already provides `PatchReporter.noop`, do not duplicate.

- [ ] **Step 1: `vp check --fix` and `vp test` for patch + patch-cli**

Expected: PASS.

- [ ] **Step 2: Update READMEs to match the new public API** (`FetchOptions.force`, `fetchStream`)

- [ ] **Step 3: Commit**

```bash
git add packages/patch-cli/src/bin.ts packages/patch/src/layers.ts packages/patch/src/SteamGuard.ts packages/patch/README.md packages/patch-cli/README.md README.md
git commit -m "feat(patch-cli): wire SteamCredentials and stdin SteamGuard"
```

---

### Task 7: Scaffold `apps/client`

**Files:**

- Modify: `pnpm-workspace.yaml` — add `- apps/*` under `packages:`
- Modify: `tsconfig.json` — add `{ "path": "./apps/client" }`
- Modify: `pnpm-workspace.yaml` `allowBuilds` — allow `electron` (and `esbuild` if required). Keep `msgpackr-extract: false` unless RPC MsgPack tests need it; the Effect example enabled `msgpackr-extract`. Prefer Effect’s JS MsgPack (`RpcSerialization.layerMsgPack`) without native extract. If tests hang or fail on optional native binding, set `allowBuilds.msgpackr-extract: true`
- Create: `apps/client/package.json`
- Create: `apps/client/tsconfig.json`
- Create: `apps/client/vite.config.ts` (vp check/test only)
- Create: `apps/client/electron.vite.config.ts`
- Create: `apps/client/src/renderer/index.html`
- Create: `apps/client/src/renderer/entry.ts` (temporary `console.log` or Foldkit hello — replaced in Task 10)
- Create: `apps/client/src/preload/index.ts` (copy from example)
- Create: `apps/client/src/main/index.ts` (minimal BrowserWindow, no RPC yet)
- Create: `apps/client/README.md`

**package.json** (`@gimped/client`):

```json
{
  "name": "@gimped/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./out/main/index.js",
  "scripts": {
    "test": "vp test",
    "build": "electron-vite build",
    "check": "vp check",
    "start": "electron-vite dev"
  },
  "dependencies": {
    "@effect/platform-node": "catalog:",
    "@foldkit/ui": "^0.144.0",
    "@gimped/common": "workspace:*",
    "@gimped/patch": "workspace:*",
    "effect": "catalog:",
    "electron": "^41.0.0",
    "foldkit": "^0.144.0"
  },
  "devDependencies": {
    "@effect/vitest": "catalog:",
    "@foldkit/vite-plugin": "^0.13.0",
    "@types/node": "catalog:",
    "electron-vite": "^2.3.0",
    "typescript": "catalog:",
    "vite-plus": "catalog:",
    "vitest": "catalog:"
  }
}
```

Pin foldkit to versions compatible with Effect `4.0.0-rc.109`. If `^0.144.0` resolves to a peer on `rc.108`, add catalog / `minimumReleaseAgeExclude` as needed and align peers. Read installed `foldkit/package.json` peerDependencies after `vp i`.

`electron.vite.config.ts`: copy `.repos/effect-electron-example/electron.vite.config.ts` but **no React**. Renderer plugins: `foldkit()` from `@foldkit/vite-plugin`. Renderer root: `src/renderer`. Main/preload: `externalizeDepsPlugin()`.

`vite.config.ts` for vp:

```ts
import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

`tsconfig.json`: like other packages, plus `"lib": ["ES2022", "DOM"]` and `"types": ["node"]`. `allowImportingTsExtensions: true`. Include `src`.

Preload: exact relay from `.repos/effect-electron-example/src/preload/index.ts`.

Minimal main: `app.whenReady` → `BrowserWindow` with preload, load `ELECTRON_RENDERER_URL` or `../renderer/index.html`. No Effect yet.

`index.html`: `<div id="root"></div>` + `<script type="module" src="./entry.ts"></script>`.

- [ ] **Step 1: Create files + `vp i` from repo root**

- [ ] **Step 2: `vp check --fix --filter @gimped/client`**

Expected: PASS (or only known unused-entry warnings you then fix).

- [ ] **Step 3: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json apps/client
git commit -m "feat(client): scaffold Electron app workspace package"
```

---

### Task 8: MessagePort RPC transport (Effect v4)

**Files:**

- Create: `apps/client/src/shared/rpc-client.ts` — port of example `rpc-client.ts` using `effect/unstable/rpc` and `Queue` instead of `Mailbox`
- Create: `apps/client/src/main/ipc-server.ts` — port of example `ipc-server.ts` (`RpcPortHandoff` as `Context.Service`)
- Create: `apps/client/src/main/harness.ts` — port adapters from example `harness.ts` (`clientAdapter` / `serverAdapter` for `node:worker_threads` `MessagePort`)
- Create: `apps/client/src/main/transport.test.ts`
- Create: `apps/client/src/shared/ping-rpc.ts` — tiny `PingRpcs` with `Ping` unary (`success: Schema.String`) and `Ticks` stream (`success: Schema.Number`, `stream: true`) **only for this task’s tests**. Delete or stop using in Task 9 if `ClientRpcs` supersedes — prefer defining `PingRpcs` in the test file if that keeps shared clean. If the test file cannot export a group used by both sides, keep `ping-rpc.ts` and delete it in Task 9 when `ClientRpcs` exists.

**Interfaces:**

- `IpcClientPort` / `IpcServerPort` — same structural types as the example
- `layerIpcClient(port)` → `Layer<RpcClient.Protocol>` + `RpcSerialization.layerMsgPack`
- `layerIpcServer` → `RpcServer.Protocol | RpcPortHandoff`
- `RpcPortHandoff` `{ bind: (port: IpcServerPort) => void }`

Port the example almost line-for-line. Replace:

- `@effect/rpc` → `effect/unstable/rpc`
- `Context.Tag` → `Context.Service<RpcPortHandoff, { bind: ... }>()("gimped/client/RpcPortHandoff")`
- `Mailbox.make` → `Queue.unbounded`; `unsafeOffer` → `Queue.offerUnsafe` or `queue.offer` inside `Effect.runSync`; `Mailbox.toStream` → `Stream.fromQueue`
- `Effect.fnUntraced` → `Effect.fn` if fnUntraced is gone
- `Effect.succeedNone` → `Effect.succeed(Option.none())` if renamed (check `.repos/effect/migration`)

- [ ] **Step 1: Write `transport.test.ts` first** (copy example tests for unary + stream order + port-swap interruption, using `PingRpcs` / `Ticks`)

Example stream test idea: handler `Ticks: () => Stream.fromIterable([1, 2, 3])`; client `Stream.runCollect(client.Ticks())` equals `[1,2,3]`.

Port-swap: bind port A, start a `Stream.never` (or `Stream.async` that never ends), bind port B, expect the first stream to interrupt (`Exit.isInterrupted`).

Use `RpcServer.layer(PingRpcs, { disableFatalDefects: true })`.

- [ ] **Step 2: Run to fail**

Run: `vp test --filter @gimped/client`

Expected: FAIL missing modules.

- [ ] **Step 3: Implement transport**

- [ ] **Step 4: Tests + check + commit**

```bash
git add apps/client/src/shared/rpc-client.ts apps/client/src/main/ipc-server.ts apps/client/src/main/harness.ts apps/client/src/main/transport.test.ts apps/client/src/shared/ping-rpc.ts
git commit -m "feat(client): add Effect v4 MessagePort RPC transport"
```

---

### Task 9: `ClientRpcs` + handlers + steam-store + workspace path

**Files:**

- Create: `apps/client/src/shared/client-rpc.ts`
- Create: `apps/client/src/shared/rpc-contract.test.ts`
- Create: `apps/client/src/main/steam-store.ts`
- Create: `apps/client/src/main/steam-store.test.ts`
- Create: `apps/client/src/main/workspace.ts`
- Create: `apps/client/src/main/workspace.test.ts`
- Create: `apps/client/src/main/handlers.ts`
- Create: `apps/client/src/main/handlers.test.ts`
- Modify: `apps/client/src/main/index.ts` — ManagedRuntime Live layer like the example, bind port on `did-finish-load`

**Interfaces:**

`apps/client/src/shared/client-rpc.ts`:

```ts
export class FetchInProgress extends Schema.TaggedError<FetchInProgress>()("FetchInProgress", {
  detail: Schema.String,
}) {}
export class NothingToClear extends Schema.TaggedError<NothingToClear>()("NothingToClear", {
  detail: Schema.String,
}) {}
export class SteamGuardNotPending extends Schema.TaggedError<SteamGuardNotPending>()(
  "SteamGuardNotPending",
  { detail: Schema.String },
) {}
export class SafeStorageFailed extends Schema.TaggedError<SafeStorageFailed>()("SafeStorageFailed", {
  detail: Schema.String,
}) {}

export const SettingsStatus = Schema.Struct({
  username: Schema.String,
  hasPassword: Schema.Boolean,
});

export const PatchFetchPayload = Schema.Struct({
  manifestId: Schema.optionalKey(Schema.String),
  full: Schema.Boolean,
  cacheDir: Schema.optionalKey(Schema.String),
  force: Schema.Boolean,
});

export class ClientRpcs extends RpcGroup.make(
  Rpc.make("PatchFetch", {
    payload: PatchFetchPayload.fields,
    success: PatchEvent,
    error: Schema.Union([
      MissingSteamCredentials,
      ToolDownloadFailed,
      MissingJava,
      DepotDownloadFailed,
      FfdecFailed,
      MissingSwf,
      KeyNotFound,
      BuildIdNotFound,
      KeyConflict,
      IoError,
      MalformedJson,
      FetchInProgress,
    ]),
    stream: true,
  }),
  Rpc.make("PatchClear", {
    payload: {
      manifestId: Schema.optionalKey(Schema.String),
      cacheDir: Schema.optionalKey(Schema.String),
    },
    error: Schema.Union([IoError, NothingToClear]),
  }),
  Rpc.make("SubmitSteamGuard", {
    payload: { code: Schema.String },
    error: SteamGuardNotPending,
  }),
  Rpc.make("SettingsGet", {
    success: SettingsStatus,
    error: SafeStorageFailed,
  }),
  Rpc.make("SettingsSet", {
    payload: { username: Schema.String, password: Schema.String },
    error: SafeStorageFailed,
  }),
) {}
```

Import each `PatchError` class for the union (same list as `PatchError` in `pipeline.ts`). If `Schema.Union` needs a single schema, create `PatchErrorSchema` in `@gimped/patch` and export it (allowed small library add).

**steam-store:** inject `encrypt`/`decrypt`/`userDataPath` as a `Context.Service` `SafeStorage` so tests do not load Electron:

```ts
export class SafeStorage extends Context.Service<SafeStorage, {
  readonly isEncryptionAvailable: () => boolean;
  readonly encryptString: (plain: string) => Uint8Array;
  readonly decryptString: (bytes: Uint8Array) => string;
  readonly userData: string;
}>()("gimped/client/SafeStorage")
```

Live layer in `main/index.ts` calls `electron.safeStorage` and `app.getPath("userData")`. File: `path.join(userData, "steam-credentials.bin")`. Payload schema `Schema.Struct({ username, password })` via `Schema.fromJsonString`. `get` missing file → `{ username: "", hasPassword: false }`. Empty username/password on `set` → `SafeStorageFailed`.

**workspace.ts:** `findWorkspaceRoot(startPaths: ReadonlyArray<string>): Effect<string | undefined>` walk parents until `pnpm-workspace.yaml` exists. `versionKeysPath(root)` = `packages/swz/src/version-keys.json` if exists.

**handlers.ts:**

- `Ref<Fiber | undefined>` for in-flight fetch; second `PatchFetch` → `FetchInProgress`
- `Deferred<string>` slot for guard; `SteamGuard` app layer: emit already done by library; `requestCode` = `Deferred.await(slot)` after creating a new Deferred stored in a Ref. `SubmitSteamGuard` completes it or `SteamGuardNotPending`
- `PatchFetch` handler: `fetchStream({ ...payload, cacheDir: emptyToUndefined(payload.cacheDir), versionKeysPath })` with `Pipeline` + credentials from steam-store (`get` → if `!hasPassword` fail `MissingSteamCredentials` on the stream)
- Map empty string cacheDir/manifestId to `undefined`
- `PatchClear`: resolve cache root; manifestId or `index.json` `latestManifestId`; else `NothingToClear`; then `clearPatch`
- One fetch at a time: if fiber running, fail immediately

Provide `SteamCredentials` layer that reads steam-store on each `get` (not cached stale password).

- [ ] **Step 1: Contract test** — procedure tags `["PatchFetch","PatchClear","SubmitSteamGuard","SettingsGet","SettingsSet"]`; MsgPack round-trip one `PatchEvent` using `RpcSerialization.layerMsgPack` (see example `rpc-contract.test.ts`)

- [ ] **Step 2: steam-store tests** with fake encrypt (`TextEncoder` identity) + temp dir

- [ ] **Step 3: workspace tests** with a temp dir that contains `pnpm-workspace.yaml` and nested `packages/swz/src/version-keys.json`

- [ ] **Step 4: handlers tests** via `RpcTest.makeClient(ClientRpcs)` with mock `Pipeline` / fake SafeStorage. Cover: stream `Completed`; `FetchInProgress`; Guard submit unblocks; clear with no id → `NothingToClear`; settings set/get `hasPassword`

- [ ] **Step 5: Wire `main/index.ts` Live layer** like the example (`RpcServer.layer(ClientRpcs)`, handlers, `layerIpcServer`, `Pipeline.Default`, NodeServices, FetchHttpClient, SafeStorage live, SteamGuard deferred layer). `toServerPort` from example. Do not use env credentials.

- [ ] **Step 6: check + test + commit**

```bash
git add apps/client
git commit -m "feat(client): add patch RPC handlers and encrypted Steam settings"
```

---

### Task 10: Foldkit shell (Patch + Settings)

**Files:**

- Create: `apps/client/src/renderer/client-api.ts`
- Create: `apps/client/src/renderer/client-api-live.ts`
- Create: `apps/client/src/renderer/patch/patch.ts`
- Create: `apps/client/src/renderer/patch/index.ts`
- Create: `apps/client/src/renderer/settings/settings.ts`
- Create: `apps/client/src/renderer/settings/index.ts`
- Create: `apps/client/src/renderer/main.ts`
- Create: `apps/client/src/renderer/entry.ts`
- Create: `apps/client/src/renderer/styles.css`
- Create: `apps/client/src/renderer/main.story.test.ts`
- Create: `apps/client/src/renderer/main.scene.test.ts`
- Modify: `apps/client/vite.config.ts` / electron renderer plugin already has foldkit

**Interfaces:**

`ClientApi` (`Context.Service`) — what Commands/Subscriptions yield (mock in tests):

```ts
{
  readonly patchFetch: (payload: PatchFetchPayload["Type"]) => Stream<PatchEvent, PatchError | FetchInProgress>;
  readonly patchClear: (payload: { manifestId?: string; cacheDir?: string }) => Effect<void, IoError | NothingToClear>;
  readonly submitSteamGuard: (code: string) => Effect<void, SteamGuardNotPending>;
  readonly settingsGet: Effect<SettingsStatus, SafeStorageFailed>;
  readonly settingsSet: (username: string, password: string) => Effect<void, SafeStorageFailed>;
}
```

Live layer: `RpcClient.make(ClientRpcs)` mapped like example `todos-api-live.ts`, including `window` `rpc-port` listener. Tests: `Layer.succeed(ClientApi, mock)`.

**Patch Model** (Schema tagged union via Foldkit `ts(...)` from `foldkit/schema`):

- Form fields always present: `manifestId: string`, `full: boolean`, `cacheDir: string`, `force: boolean`, `guardCode: string`
- `run: Idle | Running { runId: number } | Succeeded { registry } | Failed { detail: string, tag: string } | Cancelled`
- `steps: ReadonlyArray<{ step, status: Started | Skipped | Progress, fraction?: number, detail: string, reason?: string }>`
- `runId: number` counter on the parent patch model for the next fetch

Messages (verb-first past tense): `ClickedFetch`, `ClickedCancel`, `ClickedClear`, `ClickedForce`, `UpdatedManifestId`, `UpdatedCacheDir`, `ToggledFull`, `ToggledForce`, `UpdatedGuardCode`, `ClickedSubmitGuard`, `GotPatchEvent`, `FailedPatchFetch`, `SucceededClear`, `FailedClear`, `CompletedSubmitSteamGuard`, `FailedSubmitSteamGuard`.

`ClickedFetch` → `run: Running({ runId })`, increment runId, clear steps.

Subscriptions in **shell** `main.ts`:

```ts
Subscription.make<Model, Message, ClientApi>()((entry) => ({
  patchFetch: entry(
    { runId: S.optionalKey(S.Number) },
    {
      modelToDependencies: (model) =>
        model.patch.run._tag === "Running" ? { runId: model.patch.run.runId } : {},
      dependenciesToStream: (deps) => {
        if (deps.runId === undefined) {
          return Stream.empty;
        }
        return Stream.unwrap(
          Effect.gen(function* () {
            const api = yield* ClientApi;
            const patch = /* need form fields */;
            return api.patchFetch({ ... }).pipe(
              Stream.map((event) => GotPatchEvent({ event })),
              Stream.catch((error) => Stream.succeed(FailedPatchFetch({ tag: error._tag, detail: ... }))),
            );
          }),
        );
      },
    },
  ),
}))
```

Problem: `dependenciesToStream` only receives `{ runId }` and must not restart when steps change — good. Form fields must be read without putting them in deps. Use `keepAliveEquivalence` **or** store fetch payload inside `Running` when `ClickedFetch` fires (`Running { runId, payload }`) so deps are `{ runId }` and payload is inside Running (unchanged during the run). **Do that:** `Running` includes the frozen payload.

`ClickedCancel` → `Cancelled` (subscription deps drop → interrupt).

Settings submodel: `username`, `password` (local), `hasPassword`, `status`. Boot Command `LoadSettings` → `CompletedLoadSettings`. Save Command `SaveSettings`.

Shell Model: `{ screen: Schema.Literals(["Patch", "Settings"]), patch, settings }`. Sidebar: Patch, Settings, SWZ, Replay, ANM. Last three: `ClickedComingSoon` → no screen change (story asserts screen stays Patch).

View: Foldkit `HtmlBuilder`, `@foldkit/ui` Button / Input / Checkbox. Progress: for each step, show name + detail; range input or `<progress>` **only if** `fraction` is present; otherwise a “running” label.

`Runtime.makeApplication` in `entry.ts` with `subscriptions`, `container: #root`, provide `ClientApiLive` via Foldkit’s application layer option — read `.repos/foldkit/packages/foldkit/src/runtime/runtime.ts` for how to pass a Layer (`makeApplication` `layer` field if it exists). If the runtime takes `Effect.provide` around `Runtime.run`, do that.

- [ ] **Step 1: Story tests** (`foldkit/story`): Idle ClickedFetch → Running; GotPatchEvent Completed → Succeeded; ClickedCancel → Cancelled; SteamGuardRequired → Guard field in view model; ClickedComingSoon does not change screen. Use `Command.expectHas` / `message` / `given`.

- [ ] **Step 2: Scene tests** (`foldkit/scene`): Fetch button exists; coming-soon items exist.

- [ ] **Step 3: Implement submodels + shell + live API**

- [ ] **Step 4: `vp check --fix --filter @gimped/client` and `vp test --filter @gimped/client`**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client
git commit -m "feat(client): add Foldkit patch and settings screens"
```

---

### Task 11: Docs + workspace README

**Files:**

- Modify: `apps/client/README.md` — how to `vp i`, `vp run --filter @gimped/client start`, Settings first, Java on PATH, cache defaults
- Modify: root `README.md` — add a Client row under Packages / Development pointing at `apps/client`
- Modify: `packages/patch/README.md` if any leftover “Electron out of scope”

- [ ] **Step 1: Write the docs**

- [ ] **Step 2: `vp check --fix` and `vp test` from repo root** (or `--filter` patch, patch-cli, client)

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md apps/client/README.md packages/patch/README.md
git commit -m "docs: document the Electron client and patch stream API"
```

---

## Self-review (spec coverage)

| Spec requirement | Task |
| --- | --- |
| `PatchEvent` / `PatchStep` | 1 |
| `PatchReporter` + parsers | 2 |
| `SteamCredentials` / `SteamGuard` | 3, 6 |
| `fetchStream`, unary `fetch`, `force`, `clearPatch`, interrupt delete | 4 |
| Piped DepotDownloader, percent, Guard stdin | 5 |
| GitHub byte progress, FFDec/extract counts | 5 |
| CLI `force: false`, no CLI progress UI | 4, 6 |
| `apps/*`, electron-vite, Foldkit plugin | 7 |
| MessagePort RPC v4, MsgPack, port swap | 8 |
| `ClientRpcs`, safeStorage, workspace version-keys walk | 9 |
| Foldkit Subscription fetch, sidebar, Settings, Guard UI, Cancel, Force, Clear | 10 |
| README / success criteria docs | 11 |
| No installer, no SWZ screens, no fake % | 7, 10 (do not add) |
