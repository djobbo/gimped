# `@gimped/anm`

Library for Brawlhalla `.anm` animation archives. The CLI is [`@gimped/anm-cli`](../anm-cli).

On disk: little-endian `int32` uncompressed size, then zlib of the payload. Read skips the prefix and inflates the rest (prefix is not checked). Write prefixes `payload.byteLength` then deflates. Payload is a sequence of animation defs (`hasDef` bool, then UTF `key` / `name` / `file`, then moves and eager-parsed frames) until `hasDef` is false.

Decompile writes a **directory**: `index.json` plus one JSON file per def. Bone deltas are expanded to full transforms in JSON; compile re-encodes deltas. Round-trip is Schema-equal JSON with bone names omitted. zlib need not match Flash.

## Pipeline

```ts
import { compileFile, decompileFile } from "@gimped/anm";
```

Provide `Pipeline.Default` plus Node services (`TestLive` for tests).

| Function                                        | Role                    |
| ----------------------------------------------- | ----------------------- |
| `decompileFile({ inPath, outPath, dataPath? })` | `.anm` → JSON directory |
| `compileFile({ inPath, outPath })`              | JSON directory → `.anm` |

`index.json` lists `{ file, key }` in compile order. Def filenames slug `/` to `__` (same illegal-character rules as SWZ `EntryIo`). A def’s `key` must match the index entry. Extra JSON files not in the index are ignored.

`dataPath` is decompile-only: native SWZ directory or `.swz` with BoneTypes. Index `0` is `"UNKNOWN"`; further names are XML child texts. Missing table or unknown `id` omits `name`. Compile uses bone `id`; `name` is ignored.

## Services

| Module        | Role                                                         |
| ------------- | ------------------------------------------------------------ |
| `Envelope`    | size prefix + zlib                                           |
| `AnmCodec`    | payload ↔ domain; expand / re-encode deltas                  |
| `BoneTypes`   | optional index → name (`none` skips; `layer` loads `--data`) |
| `EntryIo`     | `index.json` + one JSON per def                              |
| `AnimDefJson` | `IndexJson` / `AnimDefJson` Schema                           |
| `Pipeline`    | file decompile / compile                                     |

Move fields (`loop`, `recover`, `free`, `iconUI`) are stored as in the file (already relative to `startFrame`). Platform rotation and SWF “Dupe” labels are not in `.anm` and are omitted from JSON.

## Errors

| Tag                         | When                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `InvalidAnm`                | Bad zlib, truncation, copy-from-prev with no previous bone, frame blob size mismatch, index/def `key` mismatch |
| `MissingIndex`              | Compile directory has no `index.json`                                                                          |
| `GameDataError`             | `--data` path cannot be loaded                                                                                 |
| `IoError` / `MalformedJson` | From `@gimped/common`                                                                                          |
