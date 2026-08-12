# Task 2 Report: CSV codec (exact round-trip)

## Status

Complete.

## Scope implemented

- Added `packages/swz/src/csvCodec.ts`.
- Added `packages/swz/src/csvCodec.test.ts`.
- Did not wire `JsonTranspile` (per brief).

## TDD evidence (RED -> GREEN)

### RED: wrote failing tests first

Command:

`pnpm --filter @gimped/swz exec vp test src/csvCodec.test.ts`

Result: **FAIL** as expected because module did not exist:

- `Error: Cannot find module './csvCodec.ts'`
- `Test Files 1 failed`, `Tests no tests`

### GREEN: implemented codec and re-ran focused tests

Command:

`pnpm --filter @gimped/swz exec vp test src/csvCodec.test.ts`

Result: **PASS**

- `Test Files 1 passed`
- `Tests 3 passed`

## Full suite verification

Command:

`pnpm --filter @gimped/swz exec vp test`

Result: **PASS**

- `Test Files 9 passed`
- `Tests 40 passed`

## Implementation details

- `csvToJson(content, path)` returns `Effect.Effect<CsvJsonData, MalformedCsv>`.
- `jsonToCsv(data, path)` returns `Effect.Effect<string, MalformedCsv>`.
- `\r` is stripped before line splitting; one trailing empty split line is ignored.
- Validates headers are non-empty after `trim()` and unique.
- Uses a private CSV parser with quoted fields and `""` escapes.
- Validates each data row width matches headers when parsing.
- Re-validates row/header shape when rebuilding CSV (missing/extra keys fail).
- Quotes cells containing `,`, `"`, or `\n`; escapes quotes as `""`.
- Errors are surfaced as `new MalformedCsv({ path, message })`.

## Commit

- `693c83f` — `feat(swz): add exact CSV JSON codec with header validation`

## Self-review

- Behavior matches the exact tests from brief, including quoted-cell round-trip.
- Error paths/messages are explicit for malformed CSV/header/row shape issues.
- No linter diagnostics on modified files.

## Concerns

- None.

## Task 2 review fixes (Critical/Important)

- Critical fix: preserved native trailing-newline intent across `csvToJson` -> `jsonToCsv` by attaching internal, non-enumerable parse metadata and only emitting a final `\n` when the parsed source had one.
- Important fix: added explicit no-trailing-newline round-trip test in `packages/swz/src/csvCodec.test.ts`.
- Public interfaces unchanged (`CsvJsonData`, `csvToJson`, `jsonToCsv`).
- Existing malformed CSV failure behavior unchanged (`MalformedCsv` paths preserved).

### Evidence

RED (before codec fix):

- `pnpm --filter @gimped/swz exec vp test src/csvCodec.test.ts`
- Failed: `round-trips exact native CSV without trailing newline`
- Assertion showed received value had an extra trailing `\n`.

GREEN (after codec fix):

- `pnpm --filter @gimped/swz exec vp test src/csvCodec.test.ts`
- Pass: `Test Files 1 passed`, `Tests 4 passed`.

Full suite:

- `pnpm --filter @gimped/swz exec vp test`
- Pass: `Test Files 9 passed`, `Tests 41 passed`.
