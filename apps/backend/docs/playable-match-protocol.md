# Playable custom match — post-10310 protocol inventory

Date: 2026-08-19  
Branch milestone: Task 1 (`feat/backend-stub`)  
Capture method: **mixed** — lobby/allocate path **live-captured** on 2026-08-19 (`game allocate id=1 tcp=127.0.0.1:55012 udp=65455`); post-10310 game-child frames are **dump-inferred** because child stdout is not yet merged into session logs.

## Context

Custom-room **Play** allocates a short-lived `game listen` child. The client connects to the child's ephemeral TCP port (via backend **2466**), sends **10405** `gameConnect`, and receives **10310** `matchSetup`. That handshake reaches the in-match shell. This document lists the **first packets after 10310** needed to move toward active play.

Observability: `game listen` logs every inbound/outbound frame via `observeGameFrame()`; unknown ids are logged with `recordUnknownGamePacket()`. Backend session notes include `game allocate id=… tcp=… udp=…` when **55** spawns a child.

## Handshake (confirmed)

| #   | Direction      | Id    | Name        | Required for active play? | Decoder?                | Source      |
| --- | -------------- | ----- | ----------- | ------------------------- | ----------------------- | ----------- |
| 1   | client → child | 10405 | gameConnect | yes                       | yes (`game-connect.ts`) | live + dump |
| 2   | child → client | 10310 | matchSetup  | yes                       | yes (`match-setup.ts`)  | live + dump |

## Post-10310 sequence (dump-inferred)

Packet ids **10311–10316** are assigned sequentially in `class_725.as` immediately after `var_5141` (**10310**). Client handlers are registered in `LinkUpdater.as` `var_1653[…]`.

| #   | Direction      | Id    | Dump name     | Inferred role                                                                                                                                                   | Required for active play? | Decoder? | Source        |
| --- | -------------- | ----- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | -------- | ------------- |
| 3   | child → client | 10311 | var_3         | Session sync (`method_8595`): bool flag + token string; clears transfer overlay path                                                                            | likely yes                | no       | dump-inferred |
| 4   | child → client | 10312 | var_7923      | Entity spawn snapshot (`method_289`): loop of entity records; triggers match UI + `method_856` reset                                                            | likely yes                | no       | dump-inferred |
| 5   | child → client | 10313 | var_3324      | Game-server ready (`method_4718` → `method_4663`): bool ready + tick; **clears `var_7269` timer** — missing this yields `Error_NEVER_RECEIVED_GAMESERVER_READY` | **yes**                   | no       | dump-inferred |
| 6   | client → child | 10403 | var_8410      | Empty post-connect ack (`class_139.method_673` sends on game TCP after connect gate)                                                                            | likely yes                | no       | dump-inferred |
| 7   | child → client | 10314 | var_10734     | Player disconnect notice UI (`method_7944`)                                                                                                                     | no (runtime)              | no       | dump-inferred |
| 8   | child → client | 10315 | var_1712      | Per-entity state poke (`method_3922`: entity id + value)                                                                                                        | unknown                   | no       | dump-inferred |
| 9   | child → client | 10316 | var_5078      | Forwards to UDP handler (`method_8553` → `method_1750`)                                                                                                         | unknown (UDP path)        | no       | dump-inferred |
| 10  | client → child | 10401 | var_14245     | Client ready for simulation tick (`class_139.method_3208` when `var_3590 == 4`)                                                                                 | likely yes (after sync)   | no       | dump-inferred |
| 11  | client → child | 10404 | var_7095      | Server tick / frame ack (`method_2517`: stores `var_13909`, sets `var_4502`)                                                                                    | likely yes (during match) | no       | dump-inferred |
| 12  | either         | 12100 | keepalivePing | Empty ping/pong (already echoed by child)                                                                                                                       | no                        | no       | live + dump   |

## Client error if sync incomplete

If the child sends **10310** but never sends **10313** with ready=true within ~18s, the client shows **`Error_NEVER_RECEIVED_GAMESERVER_READY`** (`class_139` tick checks `var_7269`).

## Gaps for Task 2+

- Exact **order** and **payload shapes** for **10311–10313** must be confirmed with a live trace (or capture fixture) before implementing `buildInitialSync()`.
- Gameplay input packet ids (client → child during `var_3590 == 4`) are not listed here; capture a session that reaches move/attack.
- UDP (**10316** path) is bound but not yet traced.

## How to refresh this doc (live capture)

1. `vp run listen` from `apps/backend`.
2. Launch Brawlhalla with `-h 127.0.0.1 -p 23001 -diagnosticlog`.
3. Custom room → optional bot → **Play**; stay in match until shell or error.
4. Copy ordered `game inbound` / `game outbound` lines from the console and session `notes.txt` (look for `game allocate id=…`).
5. Update the table above; mark rows **live-captured** and add decoders in `decode.ts` / names in `packets.ts` only for confirmed ids.
