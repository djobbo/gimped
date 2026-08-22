# Backend Effect Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `@gimped/backend` to Effect Context layers, Schema-typed messages/errors, and `Effect.fn`/`Effect.gen` at service/command boundaries — without changing wire behavior or in-game hot-path performance.

**Architecture:** Sync codecs stay sync and construct Schema message values with object literals / `new` (no `Schema.decode*`/`encode*` on tick). New `Session` and `Capture` services join existing `ConnectionHub` / `RoomRegistry` / `GameRuntime`. Tagged errors for UDP bind and match-spec IPC parse only.

**Tech Stack:** `effect` (catalog), `@effect/platform-node`, `@effect/vitest`, `vp` toolchain. Follow patterns in `@gimped/patch` (`Schema.TaggedStruct`) and `@gimped/replay` (`Context.Service` + `Schema.TaggedError`).

**Spec:** `docs/superpowers/specs/2026-08-20-backend-effect-architecture-design.md`

## Global Constraints

- **No functionality change** — identical packets, ports, tokens, reply order, lobby/match semantics, capture layout
- **Hot path stays sync** — no `Schema.decode*` / `encode*` / `Effect.gen` inside `protocolIngest`, game `tick`, UDP ingest, `encodeFrame`, `FrameDecoder.push`
- **Message scope B** — wire + IPC + internal protocol ADTs only (not `LobbyState` / live entity maps)
- **Codecs stay sync** — `Effect.fn` only at service / IO / command boundaries
- **Service ids** — `"@gimped/backend/<Module>"`
- **Verify with** — `vp check --fix` and `vp test` from `apps/backend` (or workspace root with filter)
- **Do not** add `BackendReplies` service or new `DecodeError`/`BitstreamError` channels

---

## File map

| File                                                      | Responsibility                                                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `apps/backend/src/messages.ts`                            | Schema defs: `TcpFrame`, `DecodedPayload` union, `HandleFrameResult`, `GameProtocolAction`, `ProtocolIngestResult`         |
| `apps/backend/src/errors.ts`                              | `UdpBindError`, `MatchSpecParseError` (+ re-export room/runtime errors later if desired; OK to leave room errors in place) |
| `apps/backend/src/framing.ts`                             | Re-export `TcpFrame` type from messages; keep sync encode/decode                                                           |
| `apps/backend/src/decode.ts`                              | Use `DecodedPayload` schema type; return same shapes                                                                       |
| Codec modules (`login-accepted.ts`, `custom-lobby.ts`, …) | Align exported `_tag` types with `DecodedPayload` members (type-only / literal returns)                                    |
| `apps/backend/src/replies.ts`                             | `HandleFrameResult` schema type; sync `handleFrame`                                                                        |
| `apps/backend/src/game-child-protocol.ts`                 | Schema-typed action/result; keep sync `protocolIngest`                                                                     |
| `apps/backend/src/session.ts`                             | `Session` as `Context.Service` + `layer(outDir)`                                                                           |
| `apps/backend/src/capture.ts`                             | `Capture` as `Context.Service` + `layer`; yield `Session` in `watchDiagnostics`                                            |
| `apps/backend/src/udp-bind.ts`                            | Fail with `UdpBindError`                                                                                                   |
| `apps/backend/src/match-spec.ts`                          | `decodeSetupArg` / ready-line helpers map Schema failures → `MatchSpecParseError` at Effect call sites                     |
| `apps/backend/src/stub.ts`                                | Yield `Session` instead of taking session arg                                                                              |
| `apps/backend/src/commands/listen.ts`                     | Provide `Session.layer` + `Capture.layer`                                                                                  |
| `apps/backend/src/commands/game-listen.ts`                | Typed parse errors for setup argv                                                                                          |
| Tests                                                     | Update imports/layer provides only; preserve assertions                                                                    |

---

### Task 1: Message schemas (`TcpFrame` + `DecodedPayload`)

**Files:**

- Create: `apps/backend/src/messages.ts`
- Modify: `apps/backend/src/framing.ts`
- Modify: `apps/backend/src/decode.ts`
- Test: `apps/backend/src/framing.test.ts`, `apps/backend/src/decode.test.ts` (existing — must keep passing)

**Interfaces:**

- Consumes: none
- Produces:
  - `TcpFrame` schema + `type TcpFrame = typeof TcpFrame.Type`
  - `DecodedPayload` union schema + `type DecodedPayload = typeof DecodedPayload.Type`
  - Individual `Schema.TaggedStruct` members for each `_tag` currently in `decode.ts`

- [ ] **Step 1: Add failing type-level / construct smoke test**

Create `apps/backend/src/messages.test.ts`:

```ts
import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { DecodedPayload, ProtocolHello, TcpFrame } from "./messages.ts";

describe("message schemas", () => {
  it("accepts a TcpFrame-shaped value", () => {
    const frame: typeof TcpFrame.Type = {
      type: 178,
      seq: undefined,
      payload: new Uint8Array([1]),
    };
    expect(frame.type).toBe(178);
  });

  it("round-trips a DecodedPayload tagged struct via Schema (not used on hot path)", () => {
    const hello = ProtocolHello.make({ text: "Brawlhalla client to server protocol 1.0" });
    const encoded = Schema.encodeUnknownSync(DecodedPayload)(hello);
    expect(Schema.decodeUnknownSync(DecodedPayload)(encoded)).toEqual(hello);
  });
});
```

If `TaggedStruct` has no `.make`, construct with `{ _tag: "ProtocolHello", text: "..." }` and still round-trip through `DecodedPayload`.

- [ ] **Step 2: Run test — expect FAIL (module missing)**

```bash
cd apps/backend
vp test src/messages.test.ts
```

Expected: FAIL resolving `./messages.ts` or missing exports.

- [ ] **Step 3: Implement `messages.ts`**

Use `@gimped/patch` style (`Schema.TaggedStruct` + `Schema.Union`). For `TcpFrame` use `Schema.Struct` (plain objects stay assignable; avoids forcing `new` at every call site while remaining Schema-typed):

```ts
import { Schema } from "effect";

export const TcpFrame = Schema.Struct({
  type: Schema.Number,
  seq: Schema.optionalKey(Schema.Number),
  payload: Schema.instanceOf(Uint8Array),
});
export type TcpFrame = typeof TcpFrame.Type;

export const ProtocolHello = Schema.TaggedStruct("ProtocolHello", {
  text: Schema.String,
});
export const ClientVersion = Schema.TaggedStruct("ClientVersion", {
  versionStamp: Schema.Number,
  platformId: Schema.Number,
});
export const LoginRequest = Schema.TaggedStruct("LoginRequest", {
  email: Schema.String,
  ticketBytes: Schema.Number,
  nameHint: Schema.String,
});
export const LoginAccepted = Schema.TaggedStruct("LoginAccepted", {
  userId: Schema.Number,
  displayName: Schema.String,
});
export const CreateCustomRoom = Schema.TaggedStruct("CreateCustomRoom", {
  flags: Schema.Number,
  playlistId: Schema.Number,
  customGameType: Schema.Number,
});
export const CustomLobby = Schema.TaggedStruct("CustomLobby", {
  roomId: Schema.Number,
  roomCode: Schema.String,
  hostUserId: Schema.Number,
  regionId: Schema.Number,
  maxPlayers: Schema.Number,
});
export const LobbySettings = Schema.TaggedStruct("LobbySettings", {
  playlistId: Schema.Number,
  customGameType: Schema.Number,
  maxPlayers: Schema.Number,
  regionId: Schema.Number,
});
export const LegendPick = Schema.TaggedStruct("LegendPick", {
  isBot: Schema.Boolean,
  slotId: Schema.Number,
  heroId: Schema.Number,
  ready: Schema.Boolean,
});
export const AddBot = Schema.TaggedStruct("AddBot", {
  controller: Schema.Number,
});
export const StartMatch = Schema.TaggedStruct("StartMatch", {});
export const GameConnect = Schema.TaggedStruct("GameConnect", {
  userId: Schema.Number,
  token: Schema.String,
});
export const MatchSetup = Schema.TaggedStruct("MatchSetup", {
  custom: Schema.Boolean,
  playerCount: Schema.Number,
  hostUserId: Schema.Number,
});
export const SessionSync = Schema.TaggedStruct("SessionSync", {
  clearTransfer: Schema.Boolean,
  token: Schema.String,
});
export const EntitySpawnEntity = Schema.Struct({
  entityId: Schema.Number,
  field2: Schema.Number,
  name: Schema.String,
  field4: Schema.String,
  field5: Schema.Number,
  userId: Schema.Number,
  field7: Schema.Number,
  field8: Schema.Boolean,
});
export const EntitySpawn = Schema.TaggedStruct("EntitySpawn", {
  entities: Schema.Array(EntitySpawnEntity),
});
export const GameServerReady = Schema.TaggedStruct("GameServerReady", {
  ready: Schema.Boolean,
  tick: Schema.Number,
});
export const PostConnectAck = Schema.TaggedStruct("PostConnectAck", {});
export const SimReady = Schema.TaggedStruct("SimReady", {});
export const TickAck = Schema.TaggedStruct("TickAck", {
  clientTick: Schema.Number,
});
export const MoveInput = Schema.TaggedStruct("MoveInput", {
  entityId: Schema.Number,
  x: Schema.optionalKey(Schema.Number),
  y: Schema.optionalKey(Schema.Number),
  tick: Schema.optionalKey(Schema.Number),
  input: Schema.optionalKey(Schema.Number),
});
export const TickPulse = Schema.TaggedStruct("TickPulse", {
  tick: Schema.Number,
});
export const TickPulseEcho = Schema.TaggedStruct("TickPulseEcho", {});
export const EntityValue = Schema.TaggedStruct("EntityValue", {
  entityId: Schema.Number,
  value: Schema.Number,
});
export const AssignGameServer = Schema.TaggedStruct("AssignGameServer", {
  userId: Schema.Number,
  levelId: Schema.Number,
  token: Schema.String,
  host: Schema.String,
  tcpPort: Schema.Number,
  udpPort: Schema.Number,
  useNetworkNext: Schema.Boolean,
});
export const IntroSync = Schema.TaggedStruct("IntroSync", {
  size: Schema.Number,
});
export const InputBroadcast = Schema.TaggedStruct("InputBroadcast", {
  size: Schema.Number,
});
export const UdpTunnel = Schema.TaggedStruct("UdpTunnel", {
  size: Schema.Number,
});
export const EntityState = Schema.TaggedStruct("EntityState", {
  entityId: Schema.Number,
  tick: Schema.Number,
  code: Schema.Number,
});
export const EntityRespawn = Schema.TaggedStruct("EntityRespawn", {
  size: Schema.Number,
});
export const Unknown = Schema.TaggedStruct("Unknown", {});

export const DecodedPayload = Schema.Union([
  ProtocolHello,
  ClientVersion,
  LoginRequest,
  LoginAccepted,
  CreateCustomRoom,
  CustomLobby,
  LobbySettings,
  LegendPick,
  AddBot,
  StartMatch,
  GameConnect,
  MatchSetup,
  SessionSync,
  EntitySpawn,
  GameServerReady,
  PostConnectAck,
  SimReady,
  TickAck,
  MoveInput,
  TickPulse,
  TickPulseEcho,
  EntityValue,
  AssignGameServer,
  IntroSync,
  InputBroadcast,
  UdpTunnel,
  EntityState,
  EntityRespawn,
  Unknown,
]);
export type DecodedPayload = typeof DecodedPayload.Type;
```

**Important:** Mirror the exact fields returned today in `decode.ts` (including both `MoveInput` shapes if both exist — prefer one TaggedStruct with optional keys so both current returns type-check). Do not change runtime decode logic.

- [ ] **Step 4: Point `framing.ts` / `decode.ts` at schemas**

In `framing.ts`, remove local `TcpFrame` type; re-export:

```ts
export type { TcpFrame } from "./messages.ts";
```

In `decode.ts`, replace the hand-written `DecodedPayload` union with:

```ts
export type { DecodedPayload } from "./messages.ts";
```

Keep `decodePayload` body identical (same object literals / same `Unknown` on catch).

Update codec modules that export duplicate `_tag` types (`login-accepted.ts`, `game-connect.ts`, `custom-lobby.ts`, `assign-game-server.ts`, `match-setup.ts`, `game-sync.ts`) so their return types are `typeof X.Type` from `messages.ts` **or** remain structurally identical — do not change encode/decode bit layouts.

- [ ] **Step 5: Run tests**

```bash
cd apps/backend
vp test src/messages.test.ts src/framing.test.ts src/decode.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/messages.ts apps/backend/src/messages.test.ts apps/backend/src/framing.ts apps/backend/src/decode.ts
# plus any codec type-only edits
git commit -m "refactor(backend): schema-type TcpFrame and DecodedPayload"
```

---

### Task 2: Protocol ADT schemas (`HandleFrameResult`, `GameProtocolAction`, `ProtocolIngestResult`)

**Files:**

- Modify: `apps/backend/src/messages.ts`
- Modify: `apps/backend/src/replies.ts`
- Modify: `apps/backend/src/game-child-protocol.ts`
- Test: `apps/backend/src/replies.test.ts`, `apps/backend/src/game-child-protocol.test.ts`, `apps/backend/src/game-replies.test.ts`

**Interfaces:**

- Consumes: `TcpFrame` from Task 1
- Produces:
  - `HandleFrameResult` schema + type
  - `GameProtocolAction` = `Reply | Close`
  - `ProtocolIngestResult` schema + type
  - Sync `handleFrame` / `protocolIngest` signatures unchanged in behavior

- [ ] **Step 1: Extend `messages.ts`**

```ts
export const HandleFrameResult = Schema.Struct({
  replies: Schema.Array(TcpFrame),
});
export type HandleFrameResult = typeof HandleFrameResult.Type;

export const GameProtocolReply = Schema.TaggedStruct("Reply", {
  frames: Schema.Array(TcpFrame),
});
export const GameProtocolClose = Schema.TaggedStruct("Close", {});
export const GameProtocolAction = Schema.Union([GameProtocolReply, GameProtocolClose]);
export type GameProtocolAction = typeof GameProtocolAction.Type;

export const ProtocolIngestResult = Schema.Struct({
  action: GameProtocolAction,
  nextPhase: Schema.optionalKey(Schema.Literals(["syncingIntoMatch", "activeMatch"])),
  // Keep remaining optional fields as Schema.optionalKey matching game-child-protocol.ts today
  // (input, introSync, introClientSimTick, unknownGameplay). For `input`, use Schema.Unknown
  // or import a small GameInput schema only if it stays sync and does not touch tick encode/decode.
  input: Schema.optionalKey(Schema.Unknown),
  introSync: Schema.optionalKey(Schema.Boolean),
  introClientSimTick: Schema.optionalKey(Schema.Number),
  unknownGameplay: Schema.optionalKey(
    Schema.Struct({
      type: Schema.Number,
      payload: Schema.instanceOf(Uint8Array),
    }),
  ),
});
export type ProtocolIngestResult = typeof ProtocolIngestResult.Type;
```

Match `GameChildPhase` literals exactly from `game-child-model.ts`.

- [ ] **Step 2: Switch replies / protocol to schema types**

`replies.ts`:

```ts
import type { HandleFrameResult, TcpFrame } from "./messages.ts";
// handleFrame body unchanged
```

`game-child-protocol.ts`:

```ts
import type { GameProtocolAction, ProtocolIngestResult, TcpFrame } from "./messages.ts";
// protocolIngest body unchanged — still sync
```

- [ ] **Step 3: Run protocol/reply tests**

```bash
cd apps/backend
vp test src/replies.test.ts src/game-child-protocol.test.ts src/game-replies.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(backend): schema-type reply and game protocol ADTs"
```

---

### Task 3: Typed errors (`UdpBindError`, `MatchSpecParseError`)

**Files:**

- Create: `apps/backend/src/errors.ts`
- Modify: `apps/backend/src/udp-bind.ts`
- Modify: `apps/backend/src/match-spec.ts`
- Modify: `apps/backend/src/commands/game-listen.ts`
- Test: add `apps/backend/src/errors.test.ts`; touch `apps/backend/src/match-spec.test.ts` if needed

**Interfaces:**

- Consumes: none
- Produces:
  - `class UdpBindError extends Schema.TaggedError<UdpBindError>()("UdpBindError", { host: Schema.String, message: Schema.String })`
  - `class MatchSpecParseError extends Schema.TaggedError<MatchSpecParseError>()("MatchSpecParseError", { reason: Schema.String })`
  - `bindUdp(host): Effect<UdpBinding, UdpBindError>`
  - Effect helpers that decode setup/ready with typed error (sync `decodeSetupArg` may remain for Flag default encode path, but game-listen should use Effect form)

- [ ] **Step 1: Failing test for `UdpBindError` mapping**

```ts
import { describe, expect, it } from "@effect/vitest";
import { UdpBindError, MatchSpecParseError } from "./errors.ts";

describe("backend errors", () => {
  it("constructs UdpBindError", () => {
    const err = new UdpBindError({ host: "127.0.0.1", message: "boom" });
    expect(err._tag).toBe("UdpBindError");
  });

  it("constructs MatchSpecParseError", () => {
    const err = new MatchSpecParseError({ reason: "bad json" });
    expect(err._tag).toBe("MatchSpecParseError");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/backend
vp test src/errors.test.ts
```

- [ ] **Step 3: Implement `errors.ts` and wire `bindUdp`**

```ts
// errors.ts
import { Schema } from "effect";

export class UdpBindError extends Schema.TaggedError<UdpBindError>()("UdpBindError", {
  host: Schema.String,
  message: Schema.String,
}) {}

export class MatchSpecParseError extends Schema.TaggedError<MatchSpecParseError>()(
  "MatchSpecParseError",
  {
    reason: Schema.String,
  },
) {}
```

In `udp-bind.ts`, change the bind callback failure from bare `Error` to:

```ts
yield *
  Effect.callback<void, UdpBindError>((resume) => {
    socket.once("error", (error) =>
      resume(
        Effect.fail(
          new UdpBindError({
            host,
            message: error instanceof Error ? error.message : String(error),
          }),
        ),
      ),
    );
    socket.bind(0, host, () => resume(Effect.void));
  });
```

Keep `runUdpListener` behavior identical.

- [ ] **Step 4: Typed setup decode for Effect**

In `match-spec.ts` add (keep existing sync helpers for Flag defaults / parent spawn):

```ts
export const decodeSetupArgEffect = (text: string) =>
  Schema.decodeUnknownEffect(MatchSetupArgLine)(text).pipe(
    Effect.mapError((error) => new MatchSpecParseError({ reason: String(error) })),
  );
```

In `game-listen.ts`, replace `const setup = decodeSetupArg(config.setup)` with:

```ts
const setup = yield * decodeSetupArgEffect(config.setup);
```

Do **not** change how the parent encodes `--setup` (`encodeSetupArg` stays sync).

- [ ] **Step 5: Run tests**

```bash
cd apps/backend
vp test src/errors.test.ts src/match-spec.test.ts src/commands/game-listen.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(backend): add UdpBindError and MatchSpecParseError"
```

---

### Task 4: `Session` Context.Service

**Files:**

- Modify: `apps/backend/src/session.ts`
- Modify: `apps/backend/src/session.test.ts`
- Modify: `apps/backend/src/stub.ts`
- Modify: `apps/backend/src/stub.test.ts`
- Modify: `apps/backend/src/commands/listen.ts` (partial — provide layer; Capture in Task 5)

**Interfaces:**

- Consumes: `FileSystem`, `Path`, `TcpFrame`
- Produces:

```ts
export class Session extends Context.Service<
  Session,
  {
    readonly dir: string;
    readonly packetsPath: string;
    readonly record: (connection: number, frame: TcpFrame) => Effect.Effect<CapturedPacket>;
    readonly note: (line: string) => Effect.Effect<void>;
  }
>()("@gimped/backend/Session") {
  static layer = (outDir: string): Layer.Layer<Session, never, FileSystem.FileSystem | Path.Path> =>
    Layer.effect(Session /* former createSession body, return Session.of({...}) */);
}
```

- Prefer removing public `createSession` **or** keep as thin alias `Effect.gen` that yields after providing — tests should use `Effect.provide(Session.layer(temp))` then `yield* Session`.
- `runStub` / `handleSocket` / `ingestChunk` take **no** session parameter; `yield* Session` instead.

- [ ] **Step 1: Update `session.test.ts` to require service (fail until implemented)**

```ts
layer(NodeServices.layer)("capture session", (it) => {
  it.effect(
    "appends decoded packets as JSON lines",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const temp = yield* fs.makeTempDirectory({ prefix: "session-" });
        const session = yield* Session;
        // ... same assertions using session.record / session.packetsPath
      }).pipe(Effect.provide(Session.layer(temp))), // NOTE: temp must be created first — nest provides:
  );
});
```

Correct nesting pattern (match existing Effect style in repo):

```ts
Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const temp = yield* fs.makeTempDirectory({ prefix: "session-" });
  yield* Effect.gen(function* () {
    const session = yield* Session;
    // record + assert
  }).pipe(Effect.provide(Session.layer(temp)));
});
```

- [ ] **Step 2: Run session test — expect FAIL**

```bash
cd apps/backend
vp test src/session.test.ts
```

- [ ] **Step 3: Implement `Session` service; update stub**

Move `createSession` body into `Session.layer`. Export `packageRoot` unchanged.

Update `ingestChunk` / `handleSocket` / `runStub` signatures to drop `session: Session` and `yield* Session` internally. Update `stub.test.ts` similarly with `Session.layer(temp)`.

In `listen.ts` for now:

```ts
const outRoot = Option.getOrElse(config.out, () => path.join(packageRoot, "captures"));
// still call watchDiagnostics with session until Task 5 — interim:
yield* Effect.scoped(
  Effect.gen(function* () {
    // provide Session.layer(outRoot) around the rest
    const session = yield* Session;
    ...
    yield* runStub({ label: "backend", startId: 1 }).pipe(
      Effect.provide(NodeSocketServer.layer(...)),
      Effect.provide(GameRuntime.layerChildProcess(...)),
      Effect.provide(RoomRegistry.layerMemory),
      Effect.provide(ConnectionHub.layerMemory),
    );
  }).pipe(Effect.provide(Session.layer(outRoot))),
);
```

Keep `watchDiagnostics(session.dir, docs, session.note)` until Task 5.

- [ ] **Step 4: Run session + stub tests**

```bash
cd apps/backend
vp test src/session.test.ts src/stub.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(backend): Session Context.Service layer"
```

---

### Task 5: `Capture` Context.Service + listen composition

**Files:**

- Modify: `apps/backend/src/capture.ts`
- Modify: `apps/backend/src/commands/listen.ts`
- Test: existing listen/stub tests; add thin `capture` unit if easy

**Interfaces:**

- Consumes: `Session`, `FileSystem`, `Path`, `ChildProcess` spawner as today
- Produces:

```ts
export class Capture extends Context.Service<
  Capture,
  {
    readonly startTshark: (port: number, pcapPath: string) => Effect.Effect<Option.Option<string>>;
    readonly watchDiagnostics: (sessionDir: string, documents: string) => Effect.Effect<void>;
  }
>()("@gimped/backend/Capture") {
  static readonly layer: Layer.Layer<Capture, never /* FS Path Session ChildProcess deps */> =
    Layer.effect(
      Capture,
      Effect.gen(function* () {
        const startTshark = Effect.fn("Capture.startTshark")(function* (port, pcapPath) {
          /* move body */
        });
        const watchDiagnostics = Effect.fn("Capture.watchDiagnostics")(
          function* (sessionDir, documents) {
            const session = yield* Session;
            // former body using session.note instead of note callback
          },
        );
        return Capture.of({ startTshark, watchDiagnostics });
      }),
    );
}
```

**Note:** `watchDiagnostics` is long-running (`Stream` watch). Same as today — forked/scoped from listen. Do not change ignore/copy behavior.

- [ ] **Step 1: Refactor `capture.ts` into service (keep free functions as deprecated wrappers only if tests need them — prefer delete wrappers)**

- [ ] **Step 2: Wire `listen.ts`**

Today `watchDiagnostics` already `Effect.forkScoped`s the `fs.watch` stream internally and returns after setup — call it the same way (do **not** wrap the whole method in another fork):

```ts
yield *
  Effect.scoped(
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const outRoot = Option.getOrElse(config.out, () => path.join(packageRoot, "captures"));
      const docs = Option.getOrElse(config.documents, () => path.join(homedir(), "Documents"));
      const { bindHost, advertiseHost } = resolveListenHosts(config.host);
      const session = yield* Session;
      const capture = yield* Capture;

      yield* Effect.log(launchHelp(advertiseHost, config.port));
      if (advertiseHost !== bindHost) {
        yield* Effect.log(
          `Remote host: bind=${bindHost} advertise=${advertiseHost} (game 2466 uses advertise)`,
        );
      }
      yield* capture.watchDiagnostics(session.dir, docs);
      if (config.tshark) {
        yield* capture.startTshark(config.port, path.join(session.dir, "capture.pcapng"));
      }
      yield* runStub({ label: "backend", startId: 1 }).pipe(
        Effect.provide(NodeSocketServer.layer({ host: bindHost, port: config.port })),
        Effect.provide(GameRuntime.layerChildProcess({ bindHost, advertiseHost })),
        Effect.provide(RoomRegistry.layerMemory),
        Effect.provide(ConnectionHub.layerMemory),
      );
    }).pipe(Effect.provide(Capture.layer), Effect.provide(Session.layer(outRoot))),
  );
```

Provide order: `Session.layer(outRoot)` must be available to `Capture.layer` (Capture’s `watchDiagnostics` yields `Session`). If Layer dependency requires it, use `Capture.layer.pipe(Layer.provide(Session.layer(outRoot)))` merged appropriately — preserve runtime behavior.

- [ ] **Step 3: Run backend package tests**

```bash
cd apps/backend
vp test
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(backend): Capture service and listen layer composition"
```

---

### Task 6: Sweep `Effect.fn` / final verification

**Files:**

- Modify: any remaining orchestration helpers that are Effectful vanilla functions (`net-host.ts` is pure sync — leave sync; `describeAddress` / `matchSpecFromLobby` stay sync per spec)
- Ensure `connection-hub.ts` / `room-registry.ts` / `game-runtime.ts` already compliant (no drive-by rewrites)
- Run full check

**Interfaces:**

- Consumes: all prior tasks
- Produces: green `vp check --fix` + `vp test`

- [ ] **Step 1: Grep for violations**

```bash
cd apps/backend
rg "createSession|watchDiagnostics\(|startTshark\(|decodeSetupArg\(" src
rg "Schema\.decode|Schema\.encode" src/game-child-protocol.ts src/game-child-runtime.ts src/game-child-loop.ts src/framing.ts
```

Expected: no leftover free `createSession` call sites; no Schema encode/decode on hot-path files.

- [ ] **Step 2: Run check + test**

```bash
cd apps/backend
vp check --fix
vp test
```

Expected: both green.

- [ ] **Step 3: Commit any formatting / leftover import fixes**

```bash
git commit -m "chore(backend): finish Effect architecture sweep"
```

---

## Spec coverage checklist

| Spec requirement                                                               | Task                       |
| ------------------------------------------------------------------------------ | -------------------------- |
| Schema-typed `TcpFrame`, `DecodedPayload`                                      | Task 1                     |
| Schema-typed `HandleFrameResult`, `GameProtocolAction`, `ProtocolIngestResult` | Task 2                     |
| Keep IPC `MatchSpec` / `GameListenReady`; typed parse errors                   | Task 3                     |
| `UdpBindError`                                                                 | Task 3                     |
| Skip `DecodeError` / `BackendReplies`                                          | (explicit non-goals)       |
| `Session` service + layer                                                      | Task 4                     |
| `Capture` service; yield `Session` for notes                                   | Task 5                     |
| listen composition                                                             | Task 5                     |
| Hot path sync / no Schema on tick                                              | Tasks 1–2, verified Task 6 |
| `Effect.fn` at services/commands                                               | Tasks 3–5                  |
| No functionality change; tests pass                                            | All + Task 6               |

## Plan self-review notes

- `MoveInput` in today’s `decode.ts` has two shapes; Task 1 uses optional keys so both remain valid without behavior change.
- `TcpFrame` as `Schema.Struct` (not `Schema.Class`) avoids construction churn while satisfying “typed with schemas”; IPC classes stay `Schema.Class` as today.
- `watchDiagnostics` already forks its watch stream internally; `listen` must keep calling it without an extra outer fork.
- Room tagged errors stay in `room-registry.ts` (already correct); no mandatory move to `errors.ts`.
