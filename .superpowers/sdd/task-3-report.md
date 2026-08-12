# Task 3 Report: XML codec (semantic round-trip)

## Status

Complete.

## Scope implemented

- Added `fast-xml-parser` to `@gimped/swz` dependencies via `catalog:`.
- Created `packages/swz/src/xmlCodec.ts`.
- Created `packages/swz/src/xmlCodec.test.ts`.
- Did not wire `JsonTranspile` (per brief).

## TDD evidence (RED -> GREEN)

### RED: wrote failing tests first

Command:

`corepack pnpm --filter @gimped/swz exec vp test src/xmlCodec.test.ts`

Result: **FAIL** as expected before implementation:

- `Error: Cannot find module './xmlCodec.ts'`
- `Test Files 1 failed`, `Tests no tests`

### GREEN: implemented codec and re-ran focused tests

Command:

`corepack pnpm --filter @gimped/swz exec vp test src/xmlCodec.test.ts`

Result: **PASS**

- `Test Files 1 passed`
- `Tests 2 passed`

## Full suite verification

Command:

`corepack pnpm --filter @gimped/swz test`

Result: **PASS**

- `Test Files 10 passed`
- `Tests 43 passed`

## Implementation details

- `XmlJsonData` is `{ readonly root: Readonly<Record<string, unknown>> }`.
- `xmlToJson(content, path)` validates XML syntax, parses with `fast-xml-parser`, and enforces exactly one root key.
- `jsonToXml(data, path)` enforces exactly one root key on `data.root` and builds XML with matching parser/builder options.
- Shared options: `ignoreAttributes: false`, `attributeNamePrefix: "@_"`, `textNodeName: "#text"`, `parseAttributeValue: false`, `parseTagValue: false`.
- Parse/build validation failures are converted to `MalformedXml` with task-provided `path`.

## Commit

- `97cc184` - `feat(swz): add semantic XML JSON codec`

## Concerns

- None.
