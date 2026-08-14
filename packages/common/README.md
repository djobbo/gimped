# `@gimped/common`

Shared Effect primitives for the other `@gimped/*` libraries. Not a CLI.

## Dotenv

`dotEnvLayer` loads a cwd `.env` into Effect `Config` (missing file is a no-op; process env wins). All CLIs provide this layer at startup.

## Errors

`Schema.TaggedError` types used across SWZ, replay, ANM, and patch:

| Error           | Fields            | When                                |
| --------------- | ----------------- | ----------------------------------- |
| `IoError`       | `path`, `message` | Filesystem / path failures          |
| `MalformedJson` | `path`, `message` | JSON parse or Schema decode failure |

`toIoError(path, cause)` and `toMalformedJson(path, cause)` map unknown causes onto those tags.

## Binary

`ByteReader` / `ByteWriter` over `Uint8Array`:

- Big-endian: `readU16BE` / `writeU16BE`, `readU32BE` / `writeU32BE`
- Little-endian: `U16` / `U32` / `I16` / `F32` / `F64`
- Signed byte, bool (`u8` 0/1), raw bytes
- Flash UTF (little-endian length): `readUTFLE` / `writeUTFLE`

SWZ checksum `rotr` stays in `@gimped/swz`. `@gimped/swz` re-exports `IoError`, `MalformedJson`, `ByteReader`, and `ByteWriter`.
