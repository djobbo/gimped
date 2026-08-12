# SWZ decompile/recompile CLI — Design

Date: 2026-08-12  
Status: approved (pending user review of this written spec)

## Goal

Build a Vite+ monorepo at the `gimped/` workspace root with:

1. `@gimped/swz` — library that decompiles and recompiles Brawlhalla `.swz` archives
2. `@gimped/swz-cli` — Effect v4 CLI wrapping that library

Commands take explicit `--in` / `--out` paths for both directions. Optional `--json` emits or consumes JSON with a registry describing each entry’s native filetype. Encryption keys are resolved from a version map (build id → key, plus aliases).

## Context (from `dumps/scripts`)

ActionScript does **not** implement SWZ crypto. Resource load path:

- `class_248` loads `.swz` bytes from disk (no transform beyond raw read)
- `class_316.method_1746` routes `var_7433 == "SWZ"` to `method_719`
- `method_719` calls `ANE_RawData.SetData(bytes)`, then loops `ANE_RawData.GetData()` until `null`
- Each `GetData()` string is either XML (`charAt(0) == '<'`) or CSV (filename on first line)
- `ANE_RawData.Init(762411009)` sets the secret key (`class_316.var_13085`, game build reflected as `10090` in related checksum/version strings)

Native ANE (`RawData`) performs WELL512-XOR + zlib. Public reverse-engineering of that ANE matches:

```
Header (big-endian):
  uint32 checksum
  uint32 seed          // PRNG seed = seed XOR secretKey

StringEntry (repeated until EOF / invalid size):
  uint32 encodedCompressedSize    // XOR'd with PRNG
  uint32 encodedDecompressedSize  // XOR'd with PRNG
  uint32 checksum
  byte   encodedZlibData[decodedCompressedSize]  // stored as: zlib(compress) then XOR
```

Decrypt path: XOR → zlib inflate → UTF-8 string. Encrypt path: UTF-8 → zlib deflate → XOR.

## Architecture

Monorepo **at workspace root** (alongside `dumps/`, `obf/`, `.repos/`, `WRITESTATS.md`). Those trees stay untouched.

```
gimped/
  packages/
    swz/          # @gimped/swz
    swz-cli/      # @gimped/swz-cli
  docs/superpowers/specs/
  package.json
  pnpm-workspace.yaml
  vite.config.ts
  ...
```

Scaffold with Vite+ (`vp create` monorepo template / patterns from `.repos/vite-plus`). Effect v4 CLI APIs from `.repos/effect` (`effect/unstable/cli`: `Command`, `Flag`, `Argument`).

**Approach:** library-first codec + thin CLI (not wrapping third-party SWZ packages as the source of truth).

## Packages

### `@gimped/swz`

| Module          | Responsibility                                                 |
| --------------- | -------------------------------------------------------------- |
| `Well512`       | PRNG matching RawData ANE                                      |
| `SwzCodec`      | Read/write header + entries (BE uint32, XOR stream, zlib)      |
| `VersionKeys`   | Load key map; resolve version/alias → `uint32` key             |
| `EntryIo`       | Map entries ↔ files (XML root tag / CSV first line → filename) |
| `JsonTranspile` | XML/CSV ↔ JSON; read/write `registry.json`                     |

Public API sketch:

- `decompile(bytes, key) → Entry[]`
- `compile(entries, key, seed?) → Uint8Array` — if `seed` omitted, pick a random `uint32` (round-trip guarantees **entry equality**, not identical archive bytes)
- `resolveKey(version: string, map) → number`
- `writeNativeDir(entries, outDir)` / `readNativeDir(inDir)`
- `writeJsonDir(entries, outDir)` / `readJsonDir(inDir)` (registry-aware)

### `@gimped/swz-cli`

Effect `Command` root `swz` with subcommands:

```
swz decompile --in <file.swz> --out <dir> [--version <id|alias>] [--json]
swz compile   --in <dir>      --out <file.swz> [--version <id|alias>] [--json]
```

- `--version` default: `latest`
- `--json` decompile: write `*.json` + `registry.json`
- `--json` compile: require `registry.json`, convert JSON → native, then pack

## Version key map

Shipped JSON in `@gimped/swz` (overridable later if needed):

```json
{
  "keys": {
    "10090": 762411009
  },
  "aliases": {
    "latest": "10090"
  }
}
```

- `keys`: map of build / `gameVersion` string → encryption key (`number`)
- `aliases`: map of human labels (patch strings, `latest`) → build id string
- CLI `--version` accepts either a key in `keys` or an alias; resolution is alias → build → key
- Initial seed data from this dump: build `10090`, key `762411009`

## JSON mode & registry

Default decompile/compile uses native `.xml` / `.csv` files.

With `--json`:

```json
{
  "files": {
    "HeroTypes.json": { "filetype": "xml" },
    "SomeTable.json": { "filetype": "csv" }
  }
}
```

- Each entry becomes a `.json` file (XML → object/tree JSON; CSV → array-of-rows or `{ header, rows }` — exact schema fixed in implementation plan, must be reversible)
- `registry.json` records original `filetype` so compile can restore XML vs CSV
- Missing registry on `--json` compile → `MissingRegistry` error
- Without `--json`, compile expects native `.xml`/`.csv` only (ignore stray `.json` unless we later add auto-detect; v1: no auto-detect)

## Error handling

Typed Effect errors mapped to CLI stderr + non-zero exit:

| Error              | When                                       |
| ------------------ | ------------------------------------------ |
| `UnknownVersion`   | `--version` not in keys or aliases         |
| `ChecksumMismatch` | Wrong key or corrupt header/entry checksum |
| `InvalidSwz`       | Truncated / malformed archive              |
| `MissingRegistry`  | `--json` compile without `registry.json`   |
| `IoError`          | Path missing or wrong type (file vs dir)   |

## Testing

- Unit: WELL512 vectors, header checksum, single-entry round-trip
- Integration: synthetic SWZ → decompile → compile → byte/entry compare
- JSON path: native → `--json` decompile → `--json` compile → entries match
- Runner: Vitest via Vite+ (`vp test` / workspace scripts)

## Out of scope (v1)

- Key bruteforce (full `uint32` scan is minutes/core in JS; patch-constrained search is seconds — not required when key map is maintained)
- Patching live game installs
- Binding to the native RawData ANE/DLL
- Vendoring third-party SWZ libraries as the codec source of truth

## Success criteria

1. `vp` monorepo at root with `@gimped/swz` and `@gimped/swz-cli`
2. Decompile a real or synthetic `.swz` with key `762411009` into XML/CSV files
3. Recompile that directory back to a valid `.swz` that decompiles to the same entries
4. `--json` round-trip preserves entry content and `filetype` via registry
5. `--version latest` resolves to build `10090` / key `762411009`
