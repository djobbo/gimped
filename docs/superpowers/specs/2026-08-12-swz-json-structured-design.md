# Structured JSON transpile for `@gimped/swz` — Design

Date: 2026-08-12  
Status: approved

## Goal

Replace lossless string-embedding in `JsonTranspile` with real structured conversion:

- CSV ↔ JSON (exact native string round-trip)
- XML ↔ JSON (semantic round-trip)
- Typed errors for malformed CSV, XML, and JSON

## Background

Current `--json` mode writes entries like `{ filetype, xml }` / `{ filetype, name, text }` where `xml`/`text` are the original native strings. The CLI design already called for structured trees; this finishes that.

Native formats (from game load path):

- XML if `trimStart` starts with `<`
- Otherwise CSV: first line = table name, second = headers, remaining = data rows

## Round-trip policy

| Format | Requirement |
| ------ | ----------- |
| CSV | Exact native string equality after JSON round-trip |
| XML | Semantic equality only (attribute order / whitespace / self-closing style may change) |

## JSON schemas

### CSV

```json
{
  "filetype": "csv",
  "name": "MyTable",
  "headers": ["a", "b"],
  "rows": [{ "a": "1", "b": "2" }]
}
```

Rules:

- All cell values are strings (no type coercion)
- Headers must be non-empty and unique — otherwise `MalformedCsv`
- Each row must contain exactly the header keys (no missing/extra) — otherwise `MalformedCsv`
- Native serialization: `name\n` + `headers.join(",")\n` + rows as comma-separated values in header order, trailing newline consistent with current native fixtures (`\n`, strip `\r` on parse)
- Quoting: if a cell contains comma, quote, or newline, wrap in `"` and escape `"` as `""` (standard CSV); parser must accept the same so exact round-trip holds for quoted cells

### XML

```json
{
  "filetype": "xml",
  "root": {
    "HeroTypes": {
      "Hero": { "@_name": "bodvar", "Stat": { "@_v": "1" } }
    }
  }
}
```

Rules:

- Use `fast-xml-parser` with attribute prefix `@_`, text key `#text`
- Repeated sibling elements become arrays
- `root` is a single-key object whose key is the root element name
- No raw XML string field in the JSON document

### Registry

Unchanged:

```json
{
  "files": {
    "HeroTypes.json": { "filetype": "xml" },
    "MyTable.json": { "filetype": "csv" }
  }
}
```

## Data flow

**`writeJsonDir` (decompile `--json`):**

1. Detect filetype per entry
2. Convert native → structured JSON (`csvToJson` / `xmlToJson`)
3. Write `*.json` + `registry.json`
4. Filename collision behavior unchanged (`IoError`)

**`readJsonDir` (compile `--json`):**

1. Require `registry.json` (`MissingRegistry` if absent)
2. Schema-decode registry and each entry
3. Ensure entry `filetype` matches registry
4. Convert structured JSON → native string (`jsonToCsv` / `jsonToXml`)
5. Return `SwzEntry[]`

## Errors

New `Schema.TaggedError` types in `errors.ts`, each with `path: string` and `message: string`:

| Error | When |
| ----- | ---- |
| `MalformedCsv` | Native CSV parse failure on decompile; invalid CSV JSON / rebuild failure on compile |
| `MalformedXml` | Native XML parse failure on decompile; invalid XML JSON / rebuild failure on compile |
| `MalformedJson` | Entry file is not valid JSON or fails entry Schema decode |

Unchanged:

| Error | When |
| ----- | ---- |
| `MissingRegistry` | `--json` compile without `registry.json` |
| `IoError` | Filesystem failures, filename collisions, registry Schema/IO issues, entry `filetype` ≠ registry filetype |

Pipeline and CLI Effect error channels must include the three new errors so they surface on stderr with non-zero exit.

## Module layout

- Keep `JsonTranspile` as `Context.Service` for directory IO + registry
- Pure converters: `csvToJson` / `jsonToCsv`, `xmlToJson` / `jsonToXml` (same package; dedicated small modules allowed)
- Dependency: add `fast-xml-parser` to `@gimped/swz`
- Prefer hand-rolled CSV codec (Brawlhalla shape is simple; exact round-trip is easier than a general CSV library)

## Testing

- CSV: exact round-trip including quoted cells; reject empty header, duplicate header, row key mismatch
- XML: parse → JSON → XML → parse again yields equivalent structure; reject malformed XML
- JSON: reject non-JSON and wrong-shaped documents with `MalformedJson`
- Existing pipeline/CLI JSON path tests updated for structured shapes and XML semantic compare where needed

## Out of scope

- Changing CLI flags
- Byte-identical XML rewrite
- Typed numeric/boolean CSV cells
- Removing `registry.json`

## Success criteria

1. No `xml` / `text` raw-string payload fields in written JSON entries
2. CSV JSON ↔ native string is exact for valid inputs
3. XML JSON uses `@_` / `#text` object trees via `fast-xml-parser`
4. Malformed CSV/XML/JSON produce the corresponding tagged errors
5. Package tests pass, including JSON pipeline round-trips
