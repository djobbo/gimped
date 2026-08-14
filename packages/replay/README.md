# `@gimped/replay`

Library for Brawlhalla `.replay` files. The CLI is [`@gimped/replay-cli`](../replay-cli).

On disk: `zlib(xor(bitstream, key[i % 64]))`. XOR is symmetric. If inflate fails, the bytes are treated as a raw bitstream (game `[sdr]` files skip inflate and XOR). First field is `replayVersion` (`u32`; this dump uses `268`). Chunks follow until type `2` (end).

Round-trip is **semantic**: decompile → compile → decompile yields Schema-equal JSON with name annotations omitted. zlib bytes need not match Flash.

## Pipeline

```ts
import { compileFile, decompileFile } from "@gimped/replay";
```

Provide `Pipeline.Default` plus Node services (`TestLive` for tests).

| Function                                        | Role                      |
| ----------------------------------------------- | ------------------------- |
| `decompileFile({ inPath, outPath, dataPath? })` | `.replay` → one JSON file |
| `compileFile({ inPath, outPath })`              | JSON → `.replay`          |

`--data` / `dataPath` is decompile-only: a native SWZ directory or a `.swz`. Best-effort tables: HeroType, CostumeType, LevelType, ScoringType, ColorScheme. Missing tables omit names; failure to load the path is `GameDataError`. Compile never loads game data; IDs in JSON are authoritative. Name / `*Name` / `*NameKey` fields are ignored. Player checksum is verified on decompile and recomputed on compile (not stored in JSON).

JSON is `ReplayJson` (Effect Schema) on both directions: `game`, `rules`, `level`, `heroSlotCount`, `players`, `results`, `inputs`, `events`, `otherEvents`. Optional names are omitted when unset.

## Services

| Module                           | Role                                                      |
| -------------------------------- | --------------------------------------------------------- |
| `Envelope`                       | inflate/deflate + XOR, raw fallback                       |
| `ReplayCodec`                    | bitstream ↔ domain                                        |
| `GameData`                       | optional ID → name (`none` skips; `layer` loads `--data`) |
| `Pipeline`                       | file decompile / compile                                  |
| `bitstream` / `xor` / `checksum` | pure `class_30` packing, 64-byte XOR, setup checksum      |

Chunk types: 3 game info, 4 match setup, 6 results, 1 inputs, 5/7 events, 2 end. Type 8 is corrupt (`InvalidReplay`). `heroSlotCount > 5` is `InvalidReplay`.

## Errors

| Tag                         | When                                                                 |
| --------------------------- | -------------------------------------------------------------------- |
| `InvalidReplay`             | Truncated bitstream, chunk 8, `heroSlotCount > 5`, unusable envelope |
| `ChecksumMismatch`          | Setup checksum ≠ recomputed (`expected` / `actual`)                  |
| `GameDataError`             | `--data` path cannot be loaded                                       |
| `IoError` / `MalformedJson` | From `@gimped/common`                                                |
