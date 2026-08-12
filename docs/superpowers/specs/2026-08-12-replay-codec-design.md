# Replay decompile/recompile — Design

Date: 2026-08-12  
Status: approved (pending user review of this written spec)

## Goal

Add Brawlhalla `.replay` decompile/recompile, matching the SWZ package split:

1. `@gimped/common` — shared Effect/IO/binary primitives extracted from `@gimped/swz`
2. `@gimped/replay` — library: envelope, bitstream, chunk codec, JSON Schema
3. `@gimped/replay-cli` — Effect v4 CLI wrapping that library

Decompile writes **one JSON file**. Compile reads that JSON and writes a game-readable `.replay`. Round-trip is **semantic**: decompile → compile → decompile yields Schema-equal JSON (name annotations omitted). zlib bytes need not match Flash.

## Context (from `dumps/scripts`)

| Role                    | Dump                                       |
| ----------------------- | ------------------------------------------ |
| Bitstream               | `class_30`                                 |
| Write `.replay`         | `class_314`                                |
| Read chunks             | `class_313.method_2634`                    |
| UI load (inflate + XOR) | `class_615.method_828`                     |
| Replay version          | `class_50.var_3399` = `268`                |
| XOR key                 | `class_314.var_6718` (init in `class_725`) |
| Bit masks               | `class_30.var_9449` = `(1<<n)-1`           |

On-disk format:

```
file = zlib_compress( xor(bitstream, key[i % 64]) )
```

XOR is symmetric. Write: XOR then compress. Read: uncompress then XOR.

Filenames containing `[sdr]` skip both inflate and XOR in the game (plaintext bitstream). This tool auto-detects: try zlib inflate; on failure use the bytes as a raw bitstream (no XOR). No extra `[sdr]` filename flag.

## Packages

```
packages/
  common/        # @gimped/common
  swz/           # @gimped/swz (imports common)
  swz-cli/
  replay/        # @gimped/replay
  replay-cli/    # @gimped/replay-cli
```

Scaffold like existing packages (Vite+, `vp test` / `vp build` / `vp check`, `effect` from catalog). Root `tsconfig.json` references all four libraries + both CLIs.

### `@gimped/common`

Move these out of `@gimped/swz` (behavior unchanged):

| Piece                       | Notes                                        |
| --------------------------- | -------------------------------------------- |
| `IoError`                   | `{ path, message }`                          |
| `MalformedJson`             | `{ path, message }`                          |
| `toIoError`                 | `PlatformError \| unknown` → `IoError`       |
| `toMalformedJson`           | `unknown` → `MalformedJson`                  |
| `ByteReader` / `ByteWriter` | byte-aligned; add `readU16BE` / `writeU16BE` |
| `runWith`                   | test helper                                  |

`rotr` stays in `@gimped/swz` (SWZ checksum only).

`@gimped/swz` imports from `@gimped/common` and **re-exports** `IoError`, `MalformedJson`, `ByteReader`, `ByteWriter` so existing `@gimped/swz` imports keep working.

### `@gimped/replay`

Depends on `@gimped/common`. Depends on `@gimped/swz` only for `--data` when the path is a `.swz` file.

### `@gimped/replay-cli`

Depends on `@gimped/replay` (+ `@gimped/swz` transitively if needed for `.swz` data). Thin `Command` wrapper, same `bin.ts` pattern as `swz-cli`.

## CLI

```
replay decompile --in <file.replay> --out <file.json> [--data <dir|.swz>]
replay compile   --in <file.json>   --out <file.replay>
```

`--data` is decompile-only. Compile never loads game data; IDs in JSON are authoritative. Name / `*Name` / `*NameKey` fields are ignored on compile.

## Data flow

**Decompile**

1. Read `--in` bytes (`IoError` on FS failure)
2. Envelope: zlib inflate; if inflate fails, use raw bytes; otherwise XOR
3. Parse bitstream → `Replay` domain value (`InvalidReplay` / `ChecksumMismatch`)
4. If `--data` is set, fill optional name fields (`GameDataError` if data cannot be loaded)
5. `Schema.encodeUnknown(ReplayJson)` → JSON text (encode failure is a defect)
6. Write `--out`

**Compile**

1. Read `--in` text
2. `Schema.decodeUnknown(ReplayJson)` (`MalformedJson` on parse/decode failure)
3. Drop name annotations; recompute player checksum
4. Write bitstream in game order: version, chunk 3, 4, 6, 1, 5, 7, 2
5. XOR then zlib deflate
6. Write `--out`

## Envelope

XOR key (64 bytes), from `class_725`:

```
107,16,222,60,68,75,209,70,160,16,82,193,178,49,211,106,
251,172,17,222,6,104,8,120,140,213,179,249,106,64,214,19,
12,174,157,197,212,107,84,114,252,87,93,26,6,115,194,81,
75,176,201,140,120,4,17,122,239,116,62,70,57,160,199,166
```

`out[i] = in[i] ^ key[i % 64]`. zlib via Node `inflateSync` / `deflateSync` (same as SWZ).

## Bitstream (`class_30`)

MSB-first packing. Write/read `n` bits of a value using masks `(1<<k)-1` (32-bit mask is `0xffffffff`).

| Primitive    | Encoding                                                          |
| ------------ | ----------------------------------------------------------------- |
| `bits(n, v)` | `n` bits of `v`, MSB first                                        |
| `u32`        | 4-byte big-endian int, copied as bytes into the bit stream        |
| `u16`        | 2-byte big-endian short, copied as bytes                          |
| `string`     | `u16` byte length + UTF-8 bytes (length capped at 65535 on write) |

First field: `replayVersion` (`u32`). This dump uses `268`. Do not reject other versions if chunks parse.

Then 4-bit chunk type, repeated until type `2` or no bytes remain.

## Chunks

| Type  | Meaning                                                                              | Layout                                                                        |
| ----- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 3     | Game info                                                                            | `u32` id, `u32` nameId, `string` if nameId ≠ 0, `bits(1)` customOnline        |
| 4     | Match setup                                                                          | rules (`15 × u32`), level `u32`, heroSlotCount `u16`, players, checksum `u32` |
| 6     | Results                                                                              | duration `u32`, scores, `u32` endValue                                        |
| 1     | Inputs                                                                               | per entity until `bits(1)=0`                                                  |
| 5     | Events                                                                               | `{ bits(1), entityId bits(5), time u32 }*` until `bits(1)=0`                  |
| 7     | Other events                                                                         | same as 5                                                                     |
| 2     | End                                                                                  | no payload                                                                    |
| 8     | Corrupt                                                                              | `InvalidReplay`                                                               |
| other | Stop the chunk loop (game default). Missing setup after the loop is `InvalidReplay`. |

**Players** (chunk 4), each prefixed with `bits(1)=1`, list ended by `bits(1)=0`:

- `u32` entityId
- `u32` team
- `string` name
- `u32` colorSchemeId
- `u32` spawnBotId (`var_7645`)
- `u32` companionId (`var_12882`)
- `u32` field2463
- `u32` field8849
- `u32` field11747
- `u32[8]` tauntIds
- `u16` field2378
- `u16` field15047
- bitfield: `{ bits(1)=1, u32 }*` then `bits(1)=0` (`class_29`)
- `u16` field4335
- `u32` field3535
- `u32` field6575
- `heroSlotCount` times: `u32` heroId, `u32` costumeId, `u32` field3172, `u32` weaponSkinId
- `bits(1)` hidden (bot/spectator/etc.)
- handicap: `bits(1)`; if 1: `u32` lives, `u32` statA, `u32` statB (`class_179`)

If `heroSlotCount > 5`, fail (`InvalidReplay`) — game does the same (`> 5`).

**Inputs** (chunk 1), per entity: `bits(1)=1`, `bits(5)` entityId, `u32` count, then `count` times: `u32` time, `bits(1)` hasInput, if 1 then `bits(14)` input. List ended by `bits(1)=0`.

**Scores** (chunk 6): if `bits(1)=0`, no scores; if 1, `{ bits(1)=1, bits(5) entityId, u16 score }*` then `bits(1)=0`.

**Checksum** (`class_314.method_3796`): uint32 over players + level id + heroSlotCount, `mod 173`. Verify on decompile (`ChecksumMismatch`). Recompute on compile; not stored in JSON.

## JSON schema

One document. Defined as Effect `Schema` (`ReplayJson`). Used on **both** directions:

- Decompile: `Schema.encodeUnknown` before write
- Compile: `Schema.decodeUnknown` after read

Optional name fields: `Schema.optional`. Encode omits them when unset. Decode accepts and compile ignores them.

```json
{
  "replayVersion": 268,
  "game": {
    "id": 0,
    "nameId": 0,
    "nameKey": "UI_Offline_Couch_Party",
    "customOnline": false
  },
  "rules": {
    "flags": 1,
    "maxPlayers": 4,
    "duration": 480,
    "roundDuration": 0,
    "startingLives": 3,
    "scoringTypeId": 1,
    "scoringTypeName": "Stock",
    "scoreToWin": 0,
    "gameSpeed": 100,
    "damageRatio": 100,
    "levelSetId": 0,
    "itemSpawnRuleSetId": 0,
    "weaponSpawnRateId": 0,
    "gadgetSpawnRateId": 0,
    "unknown12964": 0,
    "variation": 0
  },
  "level": { "id": 12, "name": "Mammoth Fortress" },
  "heroSlotCount": 1,
  "players": [],
  "results": {
    "duration": 12345,
    "scores": [{ "entityId": 1, "score": 2 }],
    "endValue": 1
  },
  "inputs": [{ "entityId": 1, "time": 16, "input": 512 }],
  "events": [{ "entityId": 1, "time": 1000 }],
  "otherEvents": [{ "entityId": 2, "time": 2000 }]
}
```

Rules names come from `class_162.toString`. `unknown12964` is the 14th `u32` (`var_12964`), unnamed in that string.

Player object:

```json
{
  "entityId": 1,
  "team": 1,
  "name": "Player",
  "colorSchemeId": 0,
  "colorSchemeName": "Blue",
  "heroes": [
    {
      "heroId": 3,
      "heroName": "Bödvar",
      "costumeId": 0,
      "costumeName": "Classic",
      "field3172": 0,
      "weaponSkinId": 0
    }
  ],
  "cosmetics": {
    "spawnBotId": 0,
    "companionId": 0,
    "field2463": 0,
    "field8849": 0,
    "field11747": 0,
    "tauntIds": [0, 0, 0, 0, 0, 0, 0, 0],
    "field2378": 0,
    "field15047": 0,
    "bitfield": [],
    "field4335": 0,
    "field3535": 0,
    "field6575": 0
  },
  "hidden": false,
  "handicap": { "lives": 0, "statA": 100, "statB": 100 }
}
```

`handicap` is omitted when the presence bit is 0. `tauntIds` is always length 8. `bitfield` is the `class_29` `u32` list.

`input` on an input row is omitted when `hasInput` is 0; compile writes `bits(1)=0` in that case. Player checksum is not a JSON field.

## Services (`@gimped/replay`)

Effect v4: `Context.Service` + `static layer`, `Effect.fn("Service.method")`, `FileSystem` / `Path` (no `node:fs`). Service ids: `"@gimped/replay/<Module>"`.

| Module          | Kind    | Role                                 |
| --------------- | ------- | ------------------------------------ |
| `bitstream.ts`  | pure    | `class_30` bit reader/writer         |
| `xor.ts`        | pure    | 64-byte XOR                          |
| `checksum.ts`   | pure    | `method_3796`                        |
| `ReplayJson.ts` | Schema  | `ReplayJson` and nested structs      |
| `Envelope`      | service | inflate/deflate + XOR + raw fallback |
| `ReplayCodec`   | service | bitstream ↔ `Replay`                 |
| `GameData`      | service | optional ID→name                     |
| `Pipeline`      | service | `decompileFile` / `compileFile`      |

`GameData.none` fills no names. `GameData.fromPath` loads `--data`: a decompiled SWZ directory (native XML/CSV) or a `.swz` via `@gimped/swz`. Best-effort tables: HeroType, CostumeType, LevelType, ScoringType, ColorScheme. Missing tables omit names; they do not fail the decompile. Load failure of the path itself is `GameDataError`.

`Pipeline.Default` composes child layers. CLI/tests provide `NodeServices.layer`.

## Errors

| Error              | Package | When                                                                     |
| ------------------ | ------- | ------------------------------------------------------------------------ |
| `IoError`          | common  | FS failure, missing path                                                 |
| `MalformedJson`    | common  | compile JSON parse or Schema decode fails                                |
| `InvalidReplay`    | replay  | truncated bitstream, bad chunk 8, `heroSlotCount > 5`, unusable envelope |
| `ChecksumMismatch` | replay  | setup checksum ≠ recomputed (`expected` / `actual`)                      |
| `GameDataError`    | replay  | `--data` path cannot be loaded                                           |

Replay `ChecksumMismatch` is a distinct tagged error from SWZ’s (different fields). Do not move SWZ’s into common.

## Testing

- Common: `ByteReader`/`ByteWriter` U16/U32, `toIoError`
- Replay: bitstream round-trip; XOR; envelope inflate+XOR and raw fallback; checksum; synthetic `ReplayJson` → compile → decompile → Schema-equal without names; Schema reject on bad JSON; CLI round-trip
- SWZ: existing tests still pass after the common extraction
- No copyrighted `.replay` files in the repo; use synthetic fixtures

## Out of scope

- Byte-identical zlib vs Flash
- Using names as compile input
- Playback / simulation
- `[sdr]` as a dedicated CLI flag (raw-bitstream fallback covers it)
- Key bruteforce, live-install patching

## Success criteria

1. `@gimped/common` exists; `@gimped/swz` uses it; SWZ tests pass
2. `replay decompile` writes Schema-valid JSON; `replay compile` Schema-decodes JSON and writes a `.replay`
3. decompile → compile → decompile is Schema-equal (names omitted)
4. Optional `--data` adds names when tables exist; compile ignores names
5. Player checksum is verified on decompile and recomputed on compile
6. Package tests pass (`vp test` / workspace `ready`)
