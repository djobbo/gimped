# Final fix report — structured JSON transpile fidelity

Date: 2026-08-12
Scope: Critical + Important findings from the whole-branch review (excluding the Game.swz fixture item, deferred).

## Changes

### Critical 1 — boolean-looking attributes were destroyed on rebuild
`packages/swz/src/xmlCodec.ts` now splits the shared fast-xml-parser options into
parser and builder instances. The builder gets `suppressBooleanAttributes: false`,
so `flag="true"` is emitted as `flag="true"` instead of a bare `flag`.
Regression test: `preserves attribute values that look like booleans`
(parse → build → parse keeps `@_flag: "true"` and `@_off: "false"`).

### Important 2 — XML declarations and processing instructions
Parser options gained `ignoreDeclaration: true` and `ignorePiTags: true`, so a
document starting with `<?xml version="1.0" encoding="utf-8"?>` still yields a
single root key and passes the single-root validation.
Test: `ignores XML declarations and processing instructions`.

### Important 3 — CSV trailing newline side-channel removed
Deleted the `HAS_TRAILING_NEWLINE` symbol and the `CsvJsonDataWithMeta` type from
`packages/swz/src/csvCodec.ts`. `jsonToCsv` now always emits a trailing `\n`, which
is documented with a code comment at the return site. The former "round-trips exact
native CSV without trailing newline" test became
`canonicalizes CSV without a trailing newline to always end with one`.

### Important 4 — newlines in cells rejected
Added `validateNoNewline`, applied to the name line, headers, and every row cell in
`jsonToCsv`. Cells containing `\n` or `\r` now fail with `MalformedCsv` and the
message `... must not contain a newline character`. Multi-line CSV parsing was
deliberately not implemented. The now-unreachable `\n` branch of `escapeCell` was
dropped. Test: `rejects cells containing newline characters`.

### Important 5 — public codec exports
`packages/swz/src/index.ts` re-exports `./csvCodec.ts` and `./xmlCodec.ts`
(`csvToJson`, `jsonToCsv`, `xmlToJson`, `jsonToXml`, `CsvJsonData`, `XmlJsonData`).
`packages/swz-cli/src/cli.test.ts` imports `xmlToJson` from `@gimped/swz` instead of
the deep relative path `../../swz/src/xmlCodec.ts`.

## Verification

| Command | Result |
| --- | --- |
| `pnpm vp test --run` (`@gimped/swz`) | 10 files, 46 tests passed |
| `pnpm vp test --run` (`@gimped/swz-cli`) | 1 file, 3 tests passed |
| `pnpm vp check` (`@gimped/swz`) | format clean, 0 errors, 5 pre-existing warnings |
| `pnpm vp check` (`@gimped/swz-cli`) | format clean, 0 warnings/errors |

The 5 remaining lint warnings are pre-existing and untouched by this change
(`require-yield` in `Well512.ts` / `VersionKeys.ts`, `no-control-regex` in
`EntryIo.ts`, unused `Effect` import in `Well512.test.ts`).

## Not done (out of scope)

- Important 6: capturing a real `Game.swz` fixture.
- Minor polish items not incidentally touched.
