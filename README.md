# gimped

TypeScript / Effect libraries and CLIs for Brawlhalla archives and related formats:

| Format      | What it is                          | Round-trip                      |
| ----------- | ----------------------------------- | ------------------------------- |
| `.swz`      | Encrypted XML/CSV resource archives | Native files or structured JSON |
| `.replay`   | Match recordings                    | One JSON document               |
| `.anm`      | Animation defs                      | Directory of JSON               |
| Steam patch | Depot + SWF scripts                 | Cached registry + SWZ keys      |

Each format is a library (`@gimped/<name>`) plus a thin CLI (`@gimped/<name>-cli`). `@gimped/common` holds shared IO and binary helpers. `@gimped/patch` fetches a Steam patch, extracts the client build id and SWZ key, and merges them into the SWZ version map.

Specs live in [`docs/superpowers/specs`](docs/superpowers/specs).

## CLI usage

Bins: `swz`, `replay`, `anm`, `patch`. From this repo (Node `>= 22.18`):

```sh
vp i
vp run --filter @gimped/swz-cli start -- --help
vp run --filter @gimped/replay-cli start -- --help
vp run --filter @gimped/anm-cli start -- --help
vp run --filter @gimped/patch-cli start -- --help
```

The examples below omit that wrapper and show the bin + flags.

### `swz`

Decompile a `.swz` to a directory, or pack a directory back to `.swz`. `--version` is a build id or alias from [`packages/swz/src/version-keys.json`](packages/swz/src/version-keys.json) (default `latest`).

```
swz decompile --in <file.swz> --out <dir> [--version <id|alias>] [--json]
swz compile   --in <dir>      --out <file.swz> [--version <id|alias>] [--json]
```

| Flag        | Default  | Meaning                                                             |
| ----------- | -------- | ------------------------------------------------------------------- |
| `--in`      | required | `.swz` file (decompile) or directory (compile)                      |
| `--out`     | required | Directory (decompile) or `.swz` file (compile)                      |
| `--version` | `latest` | Key map entry or alias                                              |
| `--json`    | off      | Structured JSON + `registry.json` instead of native `.xml` / `.csv` |

Without `--json`, decompile writes native XML/CSV (filename from XML root or CSV table name). With `--json`, each entry is a JSON document and `registry.json` records `xml` vs `csv` so compile can restore the native form. Compile `--json` fails without `registry.json`.

```sh
swz decompile --in Game.swz --out ./game
swz compile   --in ./game --out Game.swz

swz decompile --in Game.swz --out ./game-json --json
swz compile   --in ./game-json --out Game.swz --json
```

CSV JSON round-trips the native string exactly. XML JSON is a `fast-xml-parser` tree (`@_` attributes, `#text`); whitespace and attribute order may change.

### `replay`

Decompile a `.replay` to one JSON file, or compile that JSON back. Round-trip is semantic (Schema-equal JSON), not byte-identical zlib.

```
replay decompile --in <file.replay> --out <file.json> [--data <dir|.swz>]
replay compile   --in <file.json>   --out <file.replay>
```

| Flag     | Default  | Meaning                                                    |
| -------- | -------- | ---------------------------------------------------------- |
| `--in`   | required | `.replay` (decompile) or JSON (compile)                    |
| `--out`  | required | JSON (decompile) or `.replay` (compile)                    |
| `--data` | none     | Decompile only: decompiled SWZ dir or `.swz` for ID → name |

`--data` fills optional names (heroes, costumes, levels, scoring types, color schemes). Missing tables omit names; a path that cannot be loaded fails. Compile ignores name fields and recomputes the player checksum.

Plaintext bitstreams (game `[sdr]` files) are detected automatically: inflate, and on failure treat the bytes as a raw bitstream.

```sh
replay decompile --in match.replay --out match.json
replay decompile --in match.replay --out match.json --data ./game
replay compile   --in match.json --out match.replay
```

### `anm`

Decompile a `.anm` to a directory (`index.json` plus one JSON file per animation def), or compile that directory back. JSON is the only format. Frame bone deltas are expanded on decompile and re-encoded on compile.

```
anm decompile --in <file.anm> --out <dir> [--data <dir|.swz>]
anm compile   --in <dir>      --out <file.anm>
```

| Flag     | Default  | Meaning                                                          |
| -------- | -------- | ---------------------------------------------------------------- |
| `--in`   | required | `.anm` (decompile) or JSON directory (compile)                   |
| `--out`  | required | Directory (decompile) or `.anm` (compile)                        |
| `--data` | none     | Decompile only: decompiled SWZ dir or `.swz` for BoneTypes names |

Compile uses bone `id` values; optional `name` fields are ignored. Extra `*.json` files not listed in `index.json` are ignored. Missing `index.json` fails.

```sh
anm decompile --in Animation.anm --out ./anims
anm decompile --in Animation.anm --out ./anims --data ./game
anm compile   --in ./anims --out Animation.anm
```

### `patch`

Fetch one Brawlhalla Steam patch (app `291550`, Windows depot `291551`): install DepotDownloader and JPEXS if missing, download SWF/SWZ (or the full depot), export ActionScript, read client build id + SWZ key, write cache registries, and merge the key into `version-keys.json` when that file is available.

```
patch fetch [--manifest <id>] [--full] [--cache-dir <path>] [--version-keys <path>]
```

| Flag             | Default                                                     | Meaning                                  |
| ---------------- | ----------------------------------------------------------- | ---------------------------------------- |
| `--manifest`     | public latest                                               | Steam manifest id                        |
| `--full`         | off                                                         | Whole depot instead of `*.swf` / `*.swz` |
| `--cache-dir`    | see cache root                                              | Cache directory                          |
| `--version-keys` | `packages/swz/src/version-keys.json` if it exists under cwd | Key map to merge                         |

Prints the per-patch `registry.json` as JSON. Requires `STEAM_USERNAME` and `STEAM_PASSWORD` (Steam Guard via inherited stdin). Each CLI loads a cwd `.env` file without overriding existing process env. Java must be on `PATH` when FFDec is not a self-contained exe.

Cache root, first match: `--cache-dir`, `GIMPED_CACHE`, `%LOCALAPPDATA%/gimped` (Windows), otherwise `~/.cache/gimped`.

```
$CACHE/
  tools/depotdownloader/
  tools/jpexs/
  patches/<manifestId>/depot/
  patches/<manifestId>/scripts/
  patches/<manifestId>/registry.json
  index.json
```

A decoded `registry.json` is treated as complete: tools are still ensured, but Steam/FFDec are skipped. Public fetches (no `--manifest`) also set `aliases.latest` in the key map; a historical `--manifest` only adds `keys[build]`.

```sh
# env: STEAM_USERNAME, STEAM_PASSWORD; Java on PATH
patch fetch
patch fetch --manifest 1234567890
patch fetch --full --cache-dir D:\gimped-cache
```

## Packages

| Package                                     | Role                                              |
| ------------------------------------------- | ------------------------------------------------- |
| [`@gimped/common`](packages/common)         | Shared errors, binary IO, CLI `.env` loading      |
| [`@gimped/swz`](packages/swz)               | SWZ codec, version keys, native/JSON directory IO |
| [`@gimped/swz-cli`](packages/swz-cli)       | `swz` CLI                                         |
| [`@gimped/replay`](packages/replay)         | Replay envelope, bitstream, JSON Schema           |
| [`@gimped/replay-cli`](packages/replay-cli) | `replay` CLI                                      |
| [`@gimped/anm`](packages/anm)               | ANM envelope, animation codec, JSON directory IO  |
| [`@gimped/anm-cli`](packages/anm-cli)       | `anm` CLI                                         |
| [`@gimped/patch`](packages/patch)           | Cached Steam patch pipeline                       |
| [`@gimped/patch-cli`](packages/patch-cli)   | `patch` CLI                                       |

## Development

```sh
vp i
vp check --fix
vp test
```

`vp` is the workspace toolchain (pnpm under the hood). Node `>= 22.18`.
