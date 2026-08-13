# ANM decompile/recompile — Design

Date: 2026-08-13  
Status: approved (pending user review of this written spec)

## Goal

Add Brawlhalla `.anm` decompile/recompile, matching the SWZ / replay package split:

1. `@gimped/anm` — library: envelope, animation codec, JSON Schema, directory IO
2. `@gimped/anm-cli` — Effect v4 CLI wrapping that library

Decompile writes a **directory**: `index.json` plus **one JSON file per animation def**. Compile reads that directory and writes a game-readable `.anm`. Round-trip is **semantic**: decompile → compile → decompile yields Schema-equal JSON (bone name annotations omitted). zlib bytes need not match Flash.

`--data` is decompile-only. Bone **indexes** in JSON are the compile source of truth. Optional `name` fields are ignored on compile.

Frame bone deltas are **expanded** in JSON (full transforms). Compile re-encodes deltas.

## Context (from `dumps/scripts`)

| Role                             | Dump                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| Resource type `"ANM"`            | `class_248` (`fileName` suffix `.anm`)                                                 |
| Envelope (skip `int32`, zlib)    | `class_248.method_649`                                                                 |
| Dispatch                         | `class_316.method_6777` → `class_10.method_2269`                                       |
| Payload loop                     | `class_13.method_2269` (`[AnimManager.hx]` lives on `class_10`)                        |
| Animation def                    | `class_8.method_5518` (`[AnimDef.hx]`)                                                 |
| Move                             | `class_11.method_5492`                                                                 |
| Frame (lazy in-game, eager here) | `class_9.method_1295`                                                                  |
| Bone                             | `class_35.method_1941`                                                                 |
| Bone name table                  | `class_38.var_6932` from SWZ `BoneTypes` (`class_42` registers `class_38.method_8780`) |

The game dump has a Point writer (`class_9.method_4693`) and no full `.anm` writer. Compile reverses the readers.

## Packages

```
packages/
  common/        # @gimped/common — add LE / signed / float / UTF
  swz/
  swz-cli/
  replay/
  replay-cli/
  anm/           # @gimped/anm
  anm-cli/       # @gimped/anm-cli
```

Scaffold like existing packages (Vite+, `vp test` / `vp build` / `vp check`, `effect` from catalog). Root `tsconfig.json` references the new library and CLI.

### `@gimped/common`

Keep existing BE helpers. Add little-endian and Flash primitives used by ANM (behavior of existing methods unchanged):

| Primitive                  | Notes                                                                        |
| -------------------------- | ---------------------------------------------------------------------------- |
| `readU16LE` / `writeU16LE` |                                                                              |
| `readU32LE` / `writeU32LE` |                                                                              |
| `readI8` / `writeI8`       | signed byte                                                                  |
| `readI16LE` / `writeI16LE` | Flash `readShort` / `writeShort`                                             |
| `readF32LE` / `writeF32LE` | IEEE 754                                                                     |
| `readF64LE` / `writeF64LE` | IEEE 754                                                                     |
| `readBool` / `writeBool`   | `u8` 0/1                                                                     |
| `readUTF` / `writeUTF`     | Flash `ByteArray.readUTF`: `u16` length (endian of the reader) + UTF-8 bytes |

ANM uses these with little-endian. Length of UTF follows LE.

### `@gimped/anm`

Depends on `@gimped/common`. Depends on `@gimped/swz` only for `--data` when the path is a `.swz` file.

### `@gimped/anm-cli`

Depends on `@gimped/anm`. Thin `Command` wrapper, same `bin.ts` pattern as `replay-cli`.

## CLI

```
anm decompile --in <file.anm> --out <dir> [--data <dir|.swz>]
anm compile   --in <dir>      --out <file.anm>
```

`--data` is decompile-only. Compile never loads game data; bone `id` fields are authoritative. `name` on bones is ignored on compile.

No `--json` flag: JSON is the only decompile format.

## Data flow

**Decompile**

1. Read `--in` bytes (`IoError` on FS failure)
2. Envelope: skip 4-byte `int32` size; zlib-inflate the remainder (`InvalidAnm` if inflate fails)
3. Parse payload → domain (`InvalidAnm` on truncation, bad copy-from-prev, frame blob size mismatch)
4. Expand every bone delta to a full transform
5. If `--data` is set, fill optional bone `name` (`GameDataError` if the path cannot be loaded)
6. Write `--out` directory: `index.json` + one JSON file per animation def (`Schema.encodeUnknown`; encode failure is a defect)

**Compile**

1. Read `--in` / `index.json` (`MissingIndex` if absent; `IoError` on FS failure)
2. Read each listed JSON (`IoError` if a listed file is missing); `Schema.decodeUnknown` (`MalformedJson` on parse/decode failure)
3. If a def’s `key` ≠ the `index.json` entry `key` → `InvalidAnm` (`key mismatch`)
4. Drop bone name annotations
5. Re-encode bone deltas; write payload in game order
6. zlib-deflate; prefix `int32` uncompressed length (LE)
7. Write `--out`

## Envelope

On-disk:

```
file = int32_le(uncompressed_size) || zlib_compress(payload)
```

The game sets `endian = LITTLE_ENDIAN`, `readInt()`, `readBytes` of the remainder, then `ByteArray.uncompress()` (zlib). It does **not** check that the prefix equals the inflated length. This tool:

- **Read:** skip 4 bytes; `inflateSync` the rest. Inflate failure → `InvalidAnm`. Do not require the prefix to match.
- **Write:** `int32_le(payload.byteLength)` then `deflateSync(payload)`.

## Payload (`class_13.method_2269`)

Little-endian. Repeat until `readBoolean()` is false:

```
hasDef: bool                         # true → another AnimDef; false → end
key: UTF                             # map key, typically "file/name"
name: UTF                            # AnimDef name (class_8.var_4455)
file: UTF                            # SWF path (class_8.var_7188)
moveCount: u32
moves[moveCount]
```

Compile writes `true` before each def, then a final `false`.

### Move (`class_11.method_5492`)

Field order in the file (constructor args are remapped):

| File order | JSON name                        | Stored as                                               |
| ---------- | -------------------------------- | ------------------------------------------------------- |
| UTF        | `name`                           | move name                                               |
| u32        | `duration`                       | frame count (`var_14365`); number of frames in the blob |
| u32        | `loop`                           | `var_1610`                                              |
| u32        | `recover`                        | `var_14259`                                             |
| u32        | `free`                           | `var_7145`                                              |
| u32        | `iconUI`                         | `var_6104`                                              |
| u32        | `startFrame`                     | `var_6850`                                              |
| u32        | `runEndCount` then that many u32 | `runEnds`                                               |
| u32        | (not in JSON)                    | `frameBlobSize` — byte length of the following blob     |

The game records `position`, stores it as the lazy offset, then `position += frameBlobSize`. This tool **eagerly** parses `duration` frames from the blob. After parsing, the reader must have consumed exactly `frameBlobSize` bytes (`InvalidAnm` otherwise).

`loop` / `recover` / `free` / `iconUI` in `.anm` are already relative to `startFrame` (the SWF importer subtracts `startFrame` before serialize). JSON stores those ANM values as-is.

### Frame (`class_9.method_1295`)

```
index: i16
fireSocket: optional Point           # bool; if true, f64 x, f64 y
platform: optional Point
boneCount: i16
bones[boneCount]
```

`class_9.var_13517` (platform rotation) is set to `NaN` on ANM load and is **not** in the file. Omit from JSON.

`class_8.var_7457` (SWF “Dupe” labels) is **not** in `.anm`. Omit from JSON.

### Bone delta (`class_9` / `class_35`)

For bone index `i` in frame `f`:

1. If `readBoolean()` is true: clone bone `i` from the **previous frame**. Then if `readBoolean()` is false, `gfxFrame = readI8()`. If there is no previous frame, or previous frame has no index `i` → `InvalidAnm`.
2. Else: full bone vs the previous bone **in this frame** (or no previous if `i == 0`).

Full bone (`class_35.method_1941`):

```
id: i16                              # index into BoneTypes (0 = UNKNOWN)
alphaIsOne: bool                     # if false, alpha byte is written at the end
if copyMatrix (bool):                # a,b,c,d from previous bone in this frame
  a,b,c,d ← prev
else:
  if special (bool):
    if identity (bool): a=1, b=0, c=0, d=1
    else: rotation-only; after reading a,b: c=b, d=-a
  else: a,b,c,d as f32
if copyTranslation (bool): tx,ty ← prev
else: tx, ty as f32
gfxFrame: default 1; if bool, i8
if !alphaIsOne: alpha = u8 / 255
```

Copy-matrix / copy-translation / identity / rotation-only with no previous bone → `InvalidAnm`.

Bone **name string is not in the file**. Resolve `id` via `--data` BoneTypes on decompile only.

### Compile delta re-encode

Writer produces a payload the reader accepts. It does not need to match the original flag choices. Rules, in order, for bone `i` in frame `f` (compare expanded values):

**Copy from previous frame** if `f > 0`, previous frame has index `i`, and `id`, `a,b,c,d`, `tx,ty`, `alpha` are equal (not `gfxFrame`):

- `writeBool(true)`
- if `gfxFrame` also equal: `writeBool(true)`
- else: `writeBool(false)` + `writeI8(gfxFrame)`

**Else** full bone vs previous bone in this frame (`prev` may be absent):

- `writeBool(false)`
- `writeI16LE(id)`
- `writeBool(alpha === 1)`
- if `prev` exists and `a,b,c,d` equal: `writeBool(true)` (copy matrix)
- else:
  - `writeBool(false)`
  - if identity (`a=1,b=0,c=0,d=1`): `writeBool(true)`, `writeBool(true)`
  - else if rotation-only (`c === b && d === -a`): `writeBool(true)`, `writeBool(false)`, `writeF32LE(a)`, `writeF32LE(b)`
  - else: `writeBool(false)`, four `f32`
- if `prev` exists and `tx,ty` equal: `writeBool(true)`
- else: `writeBool(false)`, `writeF32LE(tx)`, `writeF32LE(ty)`
- if `gfxFrame === 1`: `writeBool(false)`
- else: `writeBool(true)`, `writeI8(gfxFrame)`
- if `alpha !== 1`: `writeU8(round(alpha * 255))`

Float compare uses the decoded `f32` values (not extra epsilon). `alpha` round-trip: decode `u8/255`, encode `round(alpha * 255)`.

Move `frameBlobSize` is the byte length of a temporary buffer of that move’s frames.

## JSON directory

`--out` / `--in` is a directory.

### `index.json`

Ordered list. Compile writes defs in this order. Schema `IndexJson`.

```json
{
  "files": [
    {
      "file": "anims__Animation_Bodvar.swf__a__AnimationBodvar.json",
      "key": "anims/Animation_Bodvar.swf/a__AnimationBodvar"
    }
  ]
}
```

Filename slug: replace `/` with `__`, then replace Windows-illegal characters the same way `@gimped/swz` `EntryIo` does. If two keys slug to the same name, append `_2`, `_3`, … Missing `index.json` on compile → `MissingIndex`. Extra `*.json` files not listed in `index.json` are ignored.

### Animation def file (`AnimDefJson`)

Used on **both** directions: decompile `Schema.encodeUnknown` before write; compile `Schema.decodeUnknown` after read.

Optional bone `name`: `Schema.optional`. Encode omits when unset. Decode accepts; compile ignores.

`fireSocket` / `platform` omitted when the presence bit is 0 (same idea as replay `handicap`).

```json
{
  "key": "anims/Animation_Bodvar.swf/a__AnimationBodvar",
  "name": "a__AnimationBodvar",
  "file": "anims/Animation_Bodvar.swf",
  "moves": [
    {
      "name": "Ready",
      "startFrame": 1,
      "duration": 12,
      "loop": 0,
      "recover": 11,
      "free": 11,
      "iconUI": 0,
      "runEnds": [],
      "frames": [
        {
          "index": 0,
          "fireSocket": { "x": 10.5, "y": -3 },
          "bones": [
            {
              "id": 12,
              "name": "a_Torso1",
              "a": 1,
              "b": 0,
              "c": 0,
              "d": 1,
              "tx": 0,
              "ty": 0,
              "alpha": 1,
              "gfxFrame": 1
            }
          ]
        }
      ]
    }
  ]
}
```

`alpha` is `0..1`. `id` is the BoneTypes index. `key` in the def file must match `index.json` `key` for that `file`; mismatch is `InvalidAnm` with reason `key mismatch`.

## BoneTypes (`--data`)

`class_38.method_8780`: `var_6932 = ["UNKNOWN", ...child texts in XML order]`. Index `0` is always `"UNKNOWN"`. Indexes `1..n` are BoneTypes children via `class_281.method_5946` (element text).

`--data` is a decompiled SWZ directory (native XML) or a `.swz` via `@gimped/swz` (same loading idea as replay `GameData`). Look up the `BoneTypes` entry. Missing table → omit names, do not fail. Unknown / out-of-range `id` → omit `name`, do not fail. Failure to load the `--data` path itself → `GameDataError`.

## Services (`@gimped/anm`)

Effect v4: `Context.Service` + `static layer`, `Effect.fn("Service.method")`, `FileSystem` / `Path` (no `node:fs`). Service ids: `"@gimped/anm/<Module>"`.

| Module                               | Kind    | Role                                        |
| ------------------------------------ | ------- | ------------------------------------------- |
| (common) `ByteReader` / `ByteWriter` | pure    | LE / signed / float / UTF                   |
| `AnimDefJson.ts`                     | Schema  | `IndexJson`, `AnimDefJson`, nested structs  |
| `Envelope`                           | service | size prefix + zlib                          |
| `AnmCodec`                           | service | payload ↔ domain; expand / re-encode deltas |
| `BoneTypes`                          | service | optional `--data` index → name              |
| `EntryIo`                            | service | `index.json` + one JSON per def             |
| `Pipeline`                           | service | `decompileFile` / `compileFile`             |

`BoneTypes.none` fills no names. `BoneTypes.fromPath` is used when `--data` is set.

`Pipeline.Default` composes child layers. CLI/tests provide `NodeServices.layer`.

## Errors

| Error           | Package | When                                                                                                            |
| --------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| `IoError`       | common  | FS failure, missing path                                                                                        |
| `MalformedJson` | common  | compile JSON parse or Schema decode fails                                                                       |
| `MissingIndex`  | anm     | compile directory has no `index.json`                                                                           |
| `InvalidAnm`    | anm     | truncated payload, bad zlib, bone copy with no previous, frame blob size mismatch, `index.json` key ≠ def `key` |
| `GameDataError` | anm     | `--data` path cannot be loaded                                                                                  |

ANM `GameDataError` is a distinct tagged error from replay’s (do not import replay’s). Shape: `{ path, message }`. `InvalidAnm`: `{ reason: string }`. `MissingIndex`: no fields required beyond the tag (path may be included as `path`).

## Testing

- Common: LE ints/floats, `i8`/`i16`, Flash UTF round-trip
- ANM: envelope size+zlib; synthetic AnimDef → compile → decompile → Schema-equal without names; delta expand/re-encode (copy-from-prev-frame, identity, rotation-only, alpha byte, gfxFrame override); Schema reject on bad JSON; CLI directory round-trip; `--data` adds names when BoneTypes exists
- No copyrighted `.anm` files in the repo; synthetic fixtures only

## Out of scope

- Byte-identical zlib vs Flash
- Using bone names as compile input
- Playback / rendering / animation viewer
- SWF MovieClip paths (Dupe labels, platform rotation)
- Writing `.anm` from SWF
- Patching live installs
- Key bruteforce

## Success criteria

1. `anm decompile` writes `index.json` + Schema-valid JSON per animation def; `anm compile` Schema-decodes that directory and writes a `.anm`
2. decompile → compile → decompile is Schema-equal (names omitted)
3. Optional `--data` adds bone names when BoneTypes exists; compile ignores names
4. Package tests pass (`vp test` / workspace `ready`)
