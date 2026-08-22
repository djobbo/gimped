# Findings

Living log. Raw captures stay in `apps/backend/captures/` (gitignored). Do not paste Steam tickets here.

## 2026-08-18 — source analysis (pre-capture)

Confirmed from `brawlhalla-src/dump`:

- Online play is Blue Mammoth backend TCP + dedicated game-server TCP/UDP, not Steam P2P and not Photon.
- The client already accepts an alternate backend: `-h` / `-p` (`class_42.as` → `class_139.method_3356`).
- First bytes after TCP connect should be packet **178** (`protocolHello`) then **30** (`clientVersion` with seq). See `docs/protocol.md`.
- Steam is an auth gate (`SteamAir.GetEncryptedAppTicket`), not the transport.

## 2026-08-18 — session 1 (handshake, no replies)

Session: `apps/backend/captures/2026-08-18T17-01-41.479Z/`

The client **did** hit the stub. Menu stayed offline with no error because we never sent 12001 (auth refused) and never completed login.

Observed per connection, matching `class_139.method_7603` then `LinkUpdater` keepalive:

| t (conn 1) | type  | name          | notes                                                |
| ---------- | ----- | ------------- | ---------------------------------------------------- |
| 0s         | 178   | protocolHello | string `Brawlhalla client to server protocol 1.0`    |
| 0s         | 30    | clientVersion | seq=0, stamp=`1009049541`, **platform=1 (Steam)**    |
| +10s       | 12100 | keepalivePing | empty payload                                        |
| +20s       | —     | close         | 20s timeout from `method_6209` / `var_11397 + 20000` |
| +20s       | —     | reconnect     | hello + version again                                |

Diagnostic log was locked by the running game (`Brawlhalla-Diagnostic-Log-20260818-190446.txt`). Packet log was enough.

Stub then started replying: 12000 challenge after version, 12100 pong on ping. Next capture should show login **20** or **88** (Steam ticket). Do not paste ticket bytes into git docs.

## 2026-08-18 — session 2 (challenge + login, no success reply)

Session: `apps/backend/captures/2026-08-18T17-11-26.933Z/`

Handshake worked. After **12000**, the client sent **20** (`loginRequest`, ~756 bytes, Steam ticket) and kept **12100** ping/pong. Menu stayed on **Connecting** because the stub never sent **2431** (`loginAccepted`, `LinkUpdater.method_8795`).

The connecting overlay (`class_456.var_5890` = connecting to Steam) only advances after `method_8795` → `class_139.method_2998`. Keepalive alone is not enough.

## 2026-08-18 — loginAccepted stub

Stub now replies to **20** / **88** with **2431**. Payload is a minimal `method_8795` snapshot: user id `1`, name `Gimped`, 9 custom-region flags from `RegionTypes.xml` (`AvailableForCustom`), empty playlists/inventory. Playlists are server-only (`xml/playlistTypes.xml` is skipped in `class_316`), so ranked queues will be empty until we encode them.

Steam tickets stay redacted in new `packets.jsonl` lines (`redacted:<length>`).

## 2026-08-18 — session 3 (login success, unanswered create room)

Session: `apps/backend/captures/2026-08-18T17-27-59.725Z/`

Login completed. Menu went online. Keepalive continued. After login the client also sent empty **155**, **184**, and **70** (Steam overlay bool); no replies needed.

Clicked **Create custom game** once. Client sent **33** (`var_5874` / `LinkUpdater.method_944`), payload `1e001020`: flags 14 (`6|8`), playlist 0, custom type 1 (`Default`), private bools `true`/`false`. Stub had no reply yet, so the UI did nothing.

Stub now answers **33** with **2445** (`var_11345` / `LinkUpdater.method_4037`): room id 1, code `GIM1`, host user 1, Default Timed ruleset, one host player, empty extra lists.

## 2026-08-18 — session 4 (in custom room, no settings/bot acks)

Session: `apps/backend/captures/2026-08-18T17-43-07.206Z/`

2445 opened character select. Header showed `Unknown #1`: region byte was 0 (`class_104.method_8561` → `UI_Unknown`) plus room id 1. Join code `GIM1` was stored (`var_8296`) but is not the header.

Player count stayed 0 and add-bot no-op'd because `var_8259` (max players for `method_6165` / `method_8230`) was 0. Default custom type has no nested ruleset, so max is that field, not the Timed XML default.

Client packets while in the room (unanswered):

| type | dump        | sender        | notes                               |
| ---- | ----------- | ------------- | ----------------------------------- |
| 41   | `var_5600`  | `method_6659` | legend/loadout select               |
| 43   | `var_14518` | `method_5412` | 1 byte `01` — lock/ready            |
| 37   | `var_4048`  | `method_875`  | settings; includes room-code string |
| 47   | `var_12109` | `class_520`   | empty; lobby tab                    |
| 44   | `var_3770`  | `method_6324` | `8a80` — add bot, controller 5      |

Stub now: region 2 + max 4 on 2445; **37** → **2448**; add **44** → **2449**.

## 2026-08-18 — session 5 (lobby works, unanswered play)

Session: `apps/backend/captures/2026-08-18T17-57-49.674Z/`

Create room, add bot, legend select all worked. Play sent empty **55** (`var_6923`). No UI change because the stub never assigned a game server.

Stub now answers **55** with **2466** (`127.0.0.1` TCP **23011** / UDP **23012**) and listens on that TCP port to capture the game-server hello (**10400**). Match setup (`method_215` / **10310**) is not implemented yet — expect connecting overlay, then a stuck transfer or `Error_FAILED_TRANSFER` until the game-server protocol is stubbed.
