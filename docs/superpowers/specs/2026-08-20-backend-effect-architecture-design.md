# Effect architecture refactor for `@gimped/backend` — Design

Date: 2026-08-20  
Status: approved (pending written-spec review)

## Goal

Refactor `@gimped/backend` for Effect modularity **without changing functionality**:

- Context layers with simple interfaces for IO / orchestration modules
- Prefer `Effect.fn` / `Effect.gen` at service and command boundaries
- Errors as `Schema.TaggedError`
- Communication messages as Schema types (wire + IPC + internal protocol ADTs)
- Sync codecs and in-game hot paths stay sync (no Schema encode/decode, no Effect wrapping per tick)

Align with monorepo patterns in `@gimped/swz` / `@gimped/replay` and `AGENTS.md`.

## Constraints (locked)

| Decision             | Choice                                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Message schema scope | **B** — wire + IPC + internal protocol ADTs (`TcpFrame`, `DecodedPayload`, `HandleFrameResult`, `GameProtocolAction`, `ProtocolIngestResult`). Not every domain record (`LobbyState`, live entity maps). |
| Pure codecs          | **A** — stay sync; use `Schema.Class` / tagged classes via `new`; `Effect.fn` only at service / IO boundaries                                                                                            |
| Performance          | No Schema `decode*` / `encode*` and no `Effect.gen` inside `protocolIngest`, game `tick`, UDP ingest, `encodeFrame`, or `FrameDecoder.push`                                                              |
| Behavior             | Identical packets, ports, tokens, reply order, lobby/match semantics, capture layout                                                                                                                     |

## Approach

**Layered services + schema types** (not “everything is Effect”, not types-only).

## Module map

| Layer              | Modules                                                                                                                                                                | Shape                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Wire codecs (sync) | `framing`, `bitstream`, packet encode/decode (`login-accepted`, `custom-lobby`, `assign-game-server`, `game-*`, …)                                                     | Pure sync; construct Schema message types with `new`; sync `RangeError` in bit readers may remain (caught by existing decode `try/catch`) |
| Message schemas    | Prefer `messages.ts` and/or colocated Schema classes next to codecs                                                                                                    | `TcpFrame`, `DecodedPayload` union, reply/protocol ADTs                                                                                   |
| Domain (plain TS)  | `lobby-state`, room member structs, live game child entity maps                                                                                                        | Not Schema-encoded per tick                                                                                                               |
| Services           | Existing: `ConnectionHub`, `RoomRegistry`, `GameRuntime`. New: `Session`, `Capture`. Do **not** add a `BackendReplies` service — keep `handleFrame` as a sync function | `Context.Service` + `layer*` + `Effect.fn` methods; ids `"@gimped/backend/<Module>"`                                                      |
| Orchestration      | `stub`, `room-replies`, `commands/*`, `game-child-runtime`, `game-child-loop`                                                                                          | `Effect.fn` / `Effect.gen`; yield services; call sync codecs inside                                                                       |

### Hot path (must stay sync)

- `FrameDecoder.push`, `encodeFrame`
- `protocolIngest` / related game protocol helpers used from tick
- Game child `tick` and UDP ingest bit packing
- `handleFrame` reply building — sync function returning a Schema-typed result (not a Context service)

## Message schemas

Construct with `new` / tagged classes; **no** per-frame Schema JSON round-trip:

- `TcpFrame` → `Schema.Class`
- `DecodedPayload` variants → `Schema.TaggedClass` + `Schema.Union` (preserve today’s `_tag` names and fields)
- `HandleFrameResult`, `GameProtocolAction` (`Reply` | `Close`), `ProtocolIngestResult`
- Keep existing IPC: `MatchSpec`, `MatchSetupSpec`, `GameListenReady` (+ `Schema.fromJsonString` only at child-process argv / stdout ready-line boundary)

Capture logging may build `DecodedPayload` with `new` for `packets.jsonl`; that path is not the match tick loop.

### Decode failure behavior (unchanged)

`decodePayload` and similar observability paths keep **swallow → `Unknown`** (or protocol `Close` where that already happens). Do **not** turn every bad packet into a fiber failure on the game path.

## Errors

Centralize new tagged errors (e.g. `errors.ts`) beside existing room/runtime errors:

| Error                  | Role                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Keep                   | `RoomNotFound`, `RoomFull`, `AlreadyInRoom`, `GameListenTimeout`                                                                   |
| Add                    | `UdpBindError` — replace bare `Error` from `bindUdp`                                                                               |
| Add                    | `MatchSpecParseError` — child argv / ready-line Schema failures                                                                    |
| Skip for this refactor | Dedicated `DecodeError` / `BitstreamError` — keep swallow-to-`Unknown` / `Close`; do not introduce new failure channels for codecs |
| Sync throws            | `RangeError` inside bit readers — remain; caught by existing `try/catch` on decode/protocol paths                                  |

## Service interfaces

### Keep (already layered)

- `ConnectionHub` — register / unregister / send / broadcast
- `RoomRegistry` — create / join / leave / roomForConnection / updateLobby
- `GameRuntime` — allocate / release (`layerFake`, `layerChildProcess`)

### Add

```ts
Session: {
  readonly dir: string
  readonly packetsPath: string
  readonly record: (connection: number, frame: TcpFrame) => Effect.Effect<CapturedPacket>
  readonly note: (line: string) => Effect.Effect<void>
}

Capture: {
  readonly startTshark: (port: number, pcapPath: string) => Effect.Effect<Option.Option<string>>
  readonly watchDiagnostics: (sessionDir: string, documents: string) => Effect.Effect<void>
}
```

`Session.layer(outRoot)` creates the stamped capture subdir (same as today’s `createSession`) so `listen` / `game listen` provide it once. `Capture.watchDiagnostics` yields `Session` and calls `session.note` (no separate note callback).

### Composition (`listen`)

Same order/behavior as today, injectable:

`Session` + `Capture` + `ConnectionHub` + `RoomRegistry` + `GameRuntime` + Node socket server / process layers.

## Data flow (behavior freeze)

**Backend listen:** CLI → session + optional tshark/diagnostics → TCP accept → frame decode → record/log → room/login handlers → replies via hub → on `startMatch`, allocate game child → `assignGameServer`.

**Game child:** parse `MatchSpec` → TCP/UDP bind → ready JSON line → connect/sync/`protocolIngest` (sync) → tick (~16ms) + UDP tunnel.

## Style rules

- Methods: `Effect.fn("Service.method")(function* (…) { … })` at services and commands
- Layers: `Layer.effect(Service, Effect.gen(…))` returning `Service.of({ … })` where applicable
- Prefer Effect `FileSystem` / `Path` (already mostly true for session/capture)
- Schema encode/decode with `fromJsonString` only at IPC text boundaries already using it
- Vanilla sync helpers allowed for pure transforms that are not services (e.g. `matchSpecFromLobby`, `otherMemberIds`) — prefer keeping them sync and tiny; convert to `Effect.fn` only if they need services

## Testing

- Keep `@effect/vitest` coverage; provide fake layers (`GameRuntime.layerFake`, memory hubs/registries, test `Session`) where useful
- No intentional assertion/behavior changes; update imports/types only as required by the refactor
- Success bar: `vp check --fix` and `vp test` in `apps/backend` (or workspace) green

## Out of scope / non-goals

- New packets, lobby rules, match simulation, or capture features
- Wire format / port / token / reply-order changes
- Making decode failures fatal on the game path
- Schema encode/decode or Effect wrapping inside tick / UDP / `protocolIngest`
- Drive-by refactors outside `@gimped/backend`
- Forcing `LobbyState` / live entity maps through Schema encode/decode

## Success criteria

1. IO/orchestration modules that currently use free Effect helpers for session/capture are `Context.Service` layers with small interfaces
2. Communication messages in scope B are Schema-typed; errors used across Effect APIs are `Schema.TaggedError`
3. Service/command entrypoints use `Effect.fn` / `Effect.gen`; hot path remains sync constructors + bit ops
4. No intentional functionality change; existing backend tests still express the same behaviors and pass
5. In-game path does not call `Schema.decode*` / `encode*` or allocate Effect fibers for codec work per tick
