# Backend TCP protocol (from dumps)

Source of truth: `brawlhalla-src/dump/scripts`.

## Connect

`class_139.method_3356` opens backend TCP (`var_6627`, `class_85`) unless `-forceoffline` is set.

- Host: `class_50.method_7696()` unless `class_42.var_8056` is set (`-h`)
- Port: `class_50.method_977()` unless `class_42.var_8927` is set (`-p`)

`method_977` computes `(115 * 25 << 3) + 1` → **23001**, plus one when a random draw is below 0.5 → **23002**. Launch with `-p` so the stub port is deterministic.

On connect, `class_139.method_7603` immediately sends two packets on the backend socket (`method_4187` → `class_85.method_2568`):

1. `LinkUpdater.var_3163` (**178**, alias `protocolHello`): `method_6089("Brawlhalla client to server protocol 1.0")`
2. `LinkUpdater.var_1802` (**30**, alias `clientVersion`): `method_8359(class_139.var_1178)` then `method_8359(var_15096)`

`var_1178` is a version stamp (`1009000000 | checksum bytes`). `var_15096` is a platform id (constructor sets `1` for Steam).

Type IDs are assigned in `class_725.as` from `LinkUpdater.var_7032` starting at `class_245.var_9522 - 1` (15).

## Frame layout (`class_85.method_1197` / `method_6988`)

Flash `Socket` writes are big-endian.

```
uint16 type     // bit 32768 set if a sequence follows
[uint32 seq]    // present when the flag is set
uint16 length
bytes payload   // class_30 bitstream
```

`LinkUpdater.method_1350` / `method_6265` decide the flag when **sending**. The decoder does not guess: it follows bit 32768.

`protocolHello` (178) is excluded from seq (`method_1350`). `clientVersion` (30) is below `var_10752` (500), so it is sent **with** a seq.

## Payload bitstream (`class_30`)

MSB-first bits. Strings: 16-bit length then UTF-8 (`method_361` / `method_5700` / `writeUTFBytes`). Packed uints (`class_279.method_8359` / `method_8152`): 4-bit prefix, then an even number of value bits.

## After handshake

On TCP connect the client also starts a keepalive timer (`LinkUpdater.method_6209`). Every 10s it sends empty **12100** (`var_14380`). Incoming 12100 is `method_3630`, which only does `var_11397 = getTimer()`. If no 12100 arrives for 20s, the client closes backend TCP and reconnects.

Login does **not** start until the server sends **12000** (`var_7394`, `method_6530`): a string stored in `class_139.var_14332`. Steam clients set `var_11493` after `GetEncryptedAppTicket` (`method_2959`), then the next tick at `class_139` ~3453 sends **20** (`var_14901`) or **88** (`var_2045`) with persona fields + encrypted ticket bytes.

**12001** (`method_2886`) is `Authentication Refused. Offline Mode Only.` **12002** (`method_7921`) drops to offline with a uint reason.

After the client sends **20**, the server replies with **2431** (`var_1783`, `LinkUpdater.method_8795`). That packet is the account snapshot: name, id, XP, region flags (`class_309.var_7881`, 9 custom-queue regions), playlists, inventory. The stub sends a minimal empty-list version. `method_8795` ends by calling `class_139.method_2998`, which advances the connecting overlay off Steam and onto Brawlhalla.

Game-server assignment is later: **2466** (`var_8382`, `method_3206`) then `class_139.method_1011` opens UDP+TCP to the assigned host.

Create custom room is **33** (`var_5874`, `LinkUpdater.method_944`). The server answers with **2445** (`var_11345`, `LinkUpdater.method_4037`): room id, custom ruleset (`method_5878` / `class_162.method_1563`), host id, room code, then player lists (`method_6841`). The stub sends a Default Timed snapshot with one host (user id `1`, name `Gimped`), max players **4** (`var_8259`, used by `class_104.method_6165`), and region **2** (Atlanta / US-E). Character-select header is `class_104.method_8561(region)` + ` #` + room id, not the join code.

Host settings changes are **37** (`var_4048`, `method_875`). Ack with **2448** (`var_719`, `method_8229`) using the same `method_5878` body, minus the room-code string `method_875` inserts after the region byte.

Add bot is **44** (`var_3770`, `method_6324`, bool true + controller 5). Ack with **2449** (`var_13930`, `method_5838` bot branch: first bool true, then `class_104.method_8230`).

Host play in a custom room sends empty **55** (`var_6923`, `class_104.method_8137`) and sets `var_836` so the button will not send again. The server answers with **2466** (`var_8382`, `LinkUpdater.method_3206`): user id, level id, session token, host, TCP port, UDP port, Network Next bool. The client then opens game-server UDP (`var_5009`) + TCP (`var_6810`) and on TCP connect sends **10400** (`var_9886`) with user id + token. TCP connect failure is `Error_FAILED_TRANSFER`.

## Diagnostic log (`class_113.as`)

`-diagnosticlog` writes `Documents/Brawlhalla-Diagnostic-Log-<date>.txt`.

- `Network,Connected,<id>` — backend TCP up
- `GameNetwork,TCP|UDP,SendPacket|ReceivePacket,...` — **game-server** channel, not backend
