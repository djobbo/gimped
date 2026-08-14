# `@gimped/swz`

Library for Brawlhalla `.swz` archives (WELL512-XOR + zlib, matching the native RawData ANE). The CLI is [`@gimped/swz-cli`](../swz-cli).

On-disk layout: big-endian header (`checksum`, `seed`) then entries (`encodedCompressedSize`, `encodedDecompressedSize`, `checksum`, XOR'd zlib payload). Decrypt is XOR → inflate → UTF-8; encrypt is the reverse. `seed` XOR secret key initializes the PRNG.

## Pipeline

Provide `layer` (or `Pipeline.Default`) plus Node `FileSystem` / `Path` / `Crypto`:

```ts
import { compileFile, decompileFile, layer } from "@gimped/swz";
```

| Function                                            | Role               |
| --------------------------------------------------- | ------------------ |
| `decompileFile({ inPath, outPath, version, json })` | `.swz` → directory |
| `compileFile({ inPath, outPath, version, json })`   | directory → `.swz` |

`version` is a build id or alias from `version-keys.json` (shipped map: build `10090` → key `762411009`, alias `latest`). If `seed` is omitted on compile, a random `uint32` is used; round-trip guarantees **entry equality**, not identical archive bytes.

**Native mode** (`json: false`): XML if the entry starts with `<`, otherwise CSV (first line = table name). Filenames come from the XML root (plus a `name`/`title` attribute when present) or the CSV table name.

**JSON mode** (`json: true`): structured documents plus `registry.json` (`files[name].filetype` is `xml` or `csv`; optional `seed`). Compile requires the registry.

CSV JSON (`name`, `headers`, `rows` of string cells) round-trips the native string exactly, including quoted commas. XML JSON is `{ filetype: "xml", root: { RootName: { ... } } }` via `fast-xml-parser` (`@_`, `#text`); semantic equality only.

## Codec and IO

Lower-level services (all `Context.Service` + `layer`):

| Service                 | Role                                                     |
| ----------------------- | -------------------------------------------------------- |
| `Well512`               | PRNG matching the ANE                                    |
| `SwzCodec`              | `compile(entries, key, seed?)` / `decompile(bytes, key)` |
| `VersionKeys`           | `resolveKey(version, map?)`                              |
| `EntryIo`               | native directory read/write                              |
| `JsonTranspile`         | JSON directory + registry                                |
| `CsvCodec` / `XmlCodec` | string ↔ structured JSON                                 |

Convenience exports: `compile`, `decompile`, `resolveKey`, `writeNativeDir`, `readNativeDir`, `writeJsonDir`, `readJsonDir`.

## Errors

| Tag                                               | When                                 |
| ------------------------------------------------- | ------------------------------------ |
| `UnknownVersion`                                  | `--version` not in keys or aliases   |
| `ChecksumMismatch`                                | Wrong key or corrupt header/entry    |
| `InvalidSwz`                                      | Truncated / malformed archive        |
| `MissingRegistry`                                 | JSON compile without `registry.json` |
| `MalformedCsv` / `MalformedXml` / `MalformedJson` | Bad native or JSON entry             |
| `IoError`                                         | Path missing, wrong type, collisions |
