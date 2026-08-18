# Short-lived game-server child — Design

Date: 2026-08-18  
Status: approved (pending user review of this written spec)

prefer effect native modules  
do not use vanilla js functions, use Effect.gen or Effect.fn  
make each module an Effect Layer

Follow `.repos/effect/LLMS.md` and shipped `effect` / `@effect/*` `AGENTS.md`. Spawn via Effect `ChildProcess` / `ChildProcessSpawner`, not `node:child_process`. Schema for the ready line and match spec.

## Goal

On custom-room Play, the backend stub **spawns a short-lived game-server process**, waits until that process is listening, then sends **2466** with the child’s host/TCP/UDP. The Brawlhalla client connects **directly** to the child (same shape as a later EC2 box). The child answers game-server hello **10405** with match setup **10310**.

Success: Play → spawn → **2466** → client TCP to child → **10405** → **10310** → no `Error_FAILED_TRANSFER`, client leaves the transfer overlay and is in the in-match shell (the match need not play).

v1 is one match at a time, loopback only, still TypeScript in `@gimped/backend`.

## Out of scope

Follow-ups live in `apps/backend/docs/later.md`. Do not implement them in this slice:

- Rollback / UDP gameplay (bind UDP; drop or log datagrams)
- Spectate **10306**
- Ranked / playlist XML
- Network Next (`useNetworkNext` is always `false`)
- Concurrent matches
- EC2 (or any remote) `GameRuntime` layer
- Rotating the session token (stay `"gimped"`)
- Capturing the child’s TCP/UDP into the session folder
- Durable Objects / any proxy in front of game sockets
- Steam-off / patched client

This spec **does** include a one-line correction note: after **2466** with `method_1011(..., true)` the hello is **10405** (`method_5889`), not **10400**. Updating `docs/protocol.md` is a later.md item, not a blocker.

## Context

Today `listen` runs two `NodeSocketServer`s: backend **23001** and a capture-only game TCP **23011**. Play (**55**) is answered with hardcoded `encodeAssignGameServer()` (`127.0.0.1:23011` / UDP **23012**). The client connects and sends **10405** (`0400199da5b5c19590` = packed user id `1` + token `"gimped"`). Nothing sends **10310**, so transfer sticks.

Game TCP uses the same `class_85` framing as the backend. Login/lobby replies on a game connection are wrong: **12000** after **30** on that socket is a bug.

## Architecture

Two processes, both from `@gimped/backend`. The client never sees Effect, spawn, or layers — only **2466** fields.

```
Brawlhalla client
  │  backend TCP 23001          game TCP+UDP (ephemeral)
  ▼                             ▼
listen  ──allocate()──►  child `game listen`
  GameRuntime                   bind 0,0 → stdout ready JSON
  on 55: wait ready             10405 → 10310
  then 2466(host,tcp,udp)
```

- **`listen`**: backend only. Stops binding **23011**.
- **`game listen`**: spawned on **55**. Binds game TCP + UDP on `127.0.0.1` port **0**. Serves game handshake only.
- **`GameRuntime`**: `allocate` / `release`. v1 layer spawns the child. A later EC2 layer implements the same methods; backend and client stay unchanged.

## Components

### `GameRuntime` (`Context.Service`)

```
allocate(spec: MatchSpec) → { id, host, tcpPort, udpPort, token }
release(id) → void
```

`MatchSpec`: `{ userId, token, levelId, includeBot }` (Schema). Token is `"gimped"`. `levelId` is `1` (non-zero; `LevelType.method_1323` rejects `0`).

The backend keeps lobby flags in a `Ref` (created on **33**/**2445**, `includeBot` set true when **2449** is sent). `allocate` reads that Ref. There is no full lobby snapshot over IPC.

v1 layer **`GameRuntimeChildProcess`**:

1. If an allocation is live, **wait** until it is released, then continue. Do not spawn a second child.
2. Spawn `process.execPath --experimental-transform-types <bin.ts> game listen` with flags for `MatchSpec`.
3. Read stdout until one JSON line matching `GameListenReady` `{ host, tcpPort, udpPort }`. Timeout **10 seconds** → fail `allocate`, do not send **2466**.
4. Return those ports plus `spec.token`. Hold the child in the layer scope.
5. `release(id)` kills the child if it is still running. Child exit also clears the live allocation.

Backend process exit must kill the child (scoped). Do not auto-respawn if the child dies after **2466**.

### CLI

`bin.ts` / `cli.ts` gains subcommand `game listen` (flags: `--user-id`, `--token`, `--level-id`, `--bot`). Existing `listen` stays the operator command.

### `game listen` process

1. Bind TCP and UDP on `127.0.0.1` with port **0**.
2. Write exactly one `GameListenReady` JSON line to stdout, then flush.
3. Accept game TCP with the existing framing stack. Do **not** call `repliesFor` (login/lobby).
4. On **10405**: decode packed user id + token string. If they match `MatchSpec`, reply **10310**. Else close the socket.
5. On **12100**: echo empty **12100**.
6. Unknown types: log and ignore.
7. UDP: keep the socket open; do not implement gameplay.

### Backend stub

`repliesFor` stays a **pure** function for login/lobby. Packet **55** is handled in the stub loop with `GameRuntime`:

- `allocate` succeeds → encode **2466** from the allocation (not hardcoded 23011/23012). `useNetworkNext` is `false`.
- `allocate` fails (spawn/ready timeout) → log, send nothing.

`encodeAssignGameServer` takes the allocation fields as arguments.

### Shared identity

Child **10310** uses the same stub identity as the lobby: user id `1`, name `Gimped`, Default Timed-style ruleset, level id `1`, plus the stub bot when `includeBot` is true. Encoder is dump-driven (`LinkUpdater.method_8488` → `class_139.method_215(..., false)`), same approach as `custom-lobby.ts`. Do not invent fields.

## Data flow

1. Host clicks Play → client sends empty **55**, sets `var_836`.
2. Backend `allocate(MatchSpec)` spawns `game listen`.
3. Child binds, prints ready, parent sends **2466**.
4. Client `method_1011(..., true)`: UDP connect to advertised UDP, TCP connect to advertised TCP, TCP callback **10405**.
5. Child **10310** → `method_8488` → `method_215`. Transfer overlay should clear.

TCP connect failure on the client is `Error_FAILED_TRANSFER` (`method_3131`). Sending **2466** before the child is listening causes that. Ready-before-2466 is mandatory.

## Error handling

| Case | Behavior |
| --- | --- |
| Spawn or ready timeout | No **2466**. Log. Client stays in the Play/transfer path. |
| Child crash after **2466** | `release` on exit. Client sees transfer fail or drop. No respawn. |
| **10405** id/token mismatch | Close game TCP. No **10310**. |
| Backend exits | Scoped layer kills the child. |
| Second Play while allocated | Wait on `allocate` until the previous child is released. |

No new “match failed” lobby packet in v1.

## Testing

`@effect/vitest` in `apps/backend`. No live Brawlhalla in CI.

- `GameListenReady` Schema round-trip
- `encodeAssignGameServer(allocation)` round-trip with non-default ports
- **10405** decode, including captured payload `0400199da5b5c19590` → user `1`, token `gimped`
- **10310** encode/decode of the minimal `method_215` snapshot
- Game replies: good **10405** → **10310**; bad token → no frames; **12100** echo; clientVersion **30** must not produce **12000**
- Stub tests provide a fake in-memory `GameRuntime` (no spawn)
- One Effect test runs `game listen`, reads the ready line, and TCP-connects to the reported port
- CLI test: subcommands `listen` and `game`

Manual: Play in the real client; expected result is the in-match shell. Update `docs/next-step.md` when implementing.

## Toolchain

`vp check --fix` and `vp test` in `apps/backend` (or workspace root). Package manager is `vp`.
