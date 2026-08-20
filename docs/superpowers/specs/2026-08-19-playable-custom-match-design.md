# Playable Custom Match — Design

Date: 2026-08-19  
Status: approved in chat (pending user review of this written spec)

prefer effect native modules  
do not use vanilla js functions, use Effect.gen or Effect.fn  
make each module an Effect Layer where the boundary benefits from replacement or scoped lifecycle

Follow `.repos/effect/LLMS.md` and shipped `effect` / `@effect/*` `AGENTS.md`. Prefer the existing backend/game-child split and extend it instead of replacing it with a fake shell.

## Goal

Turn the current custom-room flow from "reaches the in-match shell" into a **locally playable custom match**. The spawned `game listen` child should become a minimal authoritative match host for one human and an optional bot: enough match lifecycle, input handling, state updates, damage/stocks, KO/respawn, and match end to actually play.

Success: custom room Play spawns the child, the client enters the match, the player can move and fight locally, the bot can exist when requested, stocks and KO flow work, and the match can end cleanly without involving queues.

## Out of scope

Keep these out of scope for this slice:

- Queues, matchmaking, or ranked flow
- Spectating
- Real rollback netcode
- Remote hosting / EC2 / public internet reachability
- Network Next
- Concurrent matches
- Steam auth changes
- Production-quality bot AI
- Refactoring just to make files prettier before live play proves what is needed

Later live play sessions may remove unused calls or code paths discovered during bring-up.

## Current context

The branch already has the short-lived child-process architecture:

- Backend TCP handles login/lobby/custom-room flow.
- Play allocates a short-lived `game listen` child via `GameRuntime`.
- The child binds ephemeral TCP/UDP, prints a ready JSON line, accepts game TCP, and answers **10405** with **10310**.
- The client should now clear transfer and reach the in-match shell.

Relevant current files:

- `apps/backend/src/game-runtime.ts`
- `apps/backend/src/stub.ts`
- `apps/backend/src/commands/game-listen.ts`
- `apps/backend/src/game-replies.ts`
- `apps/backend/src/match-setup.ts`

This means the next slice should **extend the child into a real minimal match runtime**, not replace the current architecture.

## Architecture

Keep the two-process model:

```text
Brawlhalla client
  | backend TCP                      game TCP+UDP
  v                                  v
backend listen  --allocate()-->  child game listen
  login/lobby/custom room           minimal authoritative match runtime
  Play -> 2466                      connect -> sync -> active match -> match over
```

- **Backend** remains responsible for login, lobby, custom room, and starting a match.
- **Child game process** owns all in-match state once the client transitions.
- The backend should not attempt to understand or simulate gameplay after allocation.

## Required architecture adjustment

Do **not** grow `gameActionFor()` into all gameplay logic.

Instead, split the child into focused units:

### `MatchRuntime`

Authoritative mutable state for one match instance.

Responsibilities:

- track match phase
- track connected player and optional bot slot
- own entity state needed for playability
- accept decoded protocol events
- advance simulation on a fixed tick
- decide KO, respawn, stock loss, and match end

`MatchRuntime` should own phase transitions, not packet handlers.

### `GameProtocol`

Translates wire frames to runtime events and runtime output to wire frames.

Responsibilities:

- handshake / sync packets
- gameplay input packet decoding
- state update packet encoding
- disconnect / invalid-packet handling

This layer is protocol-facing, not rules-facing.

### `MatchLoop`

A fixed-rate server tick inside the child.

Responsibilities:

- poll or receive queued inputs
- advance the runtime deterministically
- emit outgoing state updates

This can begin as a single fixed cadence with no rollback or prediction.

### `MatchModel`

Focused data model and pure helpers where practical:

- player slots
- bot slot
- entity position/velocity/facing-like state as needed
- damage/stocks
- timers
- phase transition rules

Keep this as testable as possible without sockets.

## Match lifecycle

The child should move through a narrow state machine:

`boot -> waitingForConnect -> syncingIntoMatch -> activeMatch -> matchOver -> shutdown`

- **boot**: bind sockets, initialize runtime
- **waitingForConnect**: expect the client game handshake after **2466**
- **syncingIntoMatch**: send the initial sequence needed to fully enter the match
- **activeMatch**: accept gameplay inputs and emit authoritative updates
- **matchOver**: send the minimal end-of-match sequence
- **shutdown**: release resources and exit

This lifecycle must be explicit in the runtime so live testing can tell us which packet transitions are truly required.

## Data flow

1. Player creates custom room and optionally adds a bot.
2. Player clicks Play.
3. Backend allocates `GameRuntime` with a richer `MatchSpec`.
4. Child accepts the game connect and syncs the client fully into the match.
5. Child enters a fixed tick loop.
6. Client sends gameplay-relevant input packets.
7. Runtime applies inputs, advances game state, and emits outbound state packets.
8. Runtime handles KO, respawn, stock count, and match-over.
9. Child exits when the match ends or the client disconnects.

## MatchSpec evolution

The current `MatchSpec` is enough to start the child, but the playable slice likely needs it to carry a little more explicit match intent.

At minimum, design for:

- `userId`
- `token`
- `levelId`
- `includeBot`

Optional additions are acceptable only if live play shows the child needs them before the first frame of active play. Do not push full lobby state over IPC unless proven necessary.

## Playability target

For this slice, "playable" means:

- local player reaches actual match control, not only the shell
- at least one loop of move / attack / hit / damage feedback can occur
- stocks or equivalent lives are tracked
- a KO and respawn path exists
- the match can finish and tear down cleanly

It does **not** mean accuracy to production netcode or perfect simulation.

## Protocol strategy

Use a **protocol-guided minimalism** approach:

- prefer adding packets only after confirming they are required by dump reading or live client behavior
- log unknown packets during bring-up rather than overfitting early assumptions
- keep current dump/capture-backed handshake work as the source of truth for packet shape

The goal is not to decode the entire game protocol first. The goal is to add only the next required protocol boundaries for playable local matches.

## Error handling

| Case | Behavior |
| --- | --- |
| Handshake failure | Close game TCP; fail the match instance. |
| Unknown packet before active match | Log and ignore when safe; close only if the client cannot continue. |
| Unknown packet during active match | Prefer logging first so live sessions can distinguish required vs noise packets. |
| Runtime inconsistency / invalid phase transition | End the match and tear down the child cleanly. |
| Backend exit | Scoped child shutdown. |
| Client disconnect | End match and release child. |

Avoid clever in-place recovery in v1. Clean teardown is more valuable than fragile recovery.

## Testing

Test in layers:

- **Pure runtime/model tests** for match phases, KO, stock loss, respawn, and match-over rules.
- **Protocol tests** for each new decode/encode boundary added to enter and sustain active play.
- **Child integration tests** that spawn `game listen`, drive the socket through the next protocol milestone, and verify replies.
- **Manual live tests** with the real client to determine which additional packets are actually required.

The live sessions are part of the design, not an afterthought, because later cleanup depends on observed unused branches.

## Implementation guidance

The next implementation plan should be incremental:

1. establish child-side runtime/module boundaries
2. add the next required sync packets to move beyond shell-only state
3. identify and decode the first gameplay-relevant inbound client packets
4. introduce a fixed tick and minimal authoritative state updates
5. add KO/respawn/match-end logic
6. use manual Brawlhalla runs to trim or refine packet/state assumptions

Each increment should preserve the current working architecture and keep queues out of scope.
