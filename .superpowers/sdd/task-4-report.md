# Task 4 Report: JsonTranspile structured converters

## Status

Implemented and committed as `3da68a1 feat(swz): wire JsonTranspile to structured codecs`.

## Changes

- Replaced JSON payload embedding in `packages/swz/src/JsonTranspile.ts`:
  - XML now persists `{ filetype: "xml", root }` via `xmlToJson`.
  - CSV now persists `{ filetype: "csv", name, headers, rows }` via `csvToJson`.
  - Read path rebuilds entry content through `jsonToXml` / `jsonToCsv`.
- Mapped JSON schema decode failures to `MalformedJson` (instead of `IoError`) in `readJsonDir`.
- Widened `PipelineError` in `packages/swz/src/pipeline.ts` to include `MalformedCsv | MalformedXml | MalformedJson`.
- Updated JSON-path round-trip assertions to be semantic for XML and exact for CSV in:
  - `packages/swz/src/JsonTranspile.test.ts`
  - `packages/swz/src/pipeline.test.ts`
  - `packages/swz-cli/src/cli.test.ts`
- Added malformed CSV read-case coverage from a well-typed JSON entry (`headers` duplicate) expecting `MalformedCsv`.

## TDD evidence

### RED (tests-first)

1) Updated `JsonTranspile` tests before production edits to require structured shapes and error split.

2) Ran:

`pnpm --filter @gimped/swz exec vp test src/JsonTranspile.test.ts`

Result: exit `1` with expected failures:
- Old XML payload shape (`xml` string) vs new expected `root` object.
- Old error mapping (`IoError`) vs expected `MalformedJson` on schema decode failure.

### GREEN

After implementing structured conversion + error mapping + pipeline/CLI test updates, ran:

- `pnpm --filter @gimped/swz exec vp test src/JsonTranspile.test.ts src/pipeline.test.ts`
- `pnpm --filter @gimped/swz-cli exec vp test`

Result: exit `0`, all focused tests passed.

## Verification

- Full `swz` suite: `pnpm --filter @gimped/swz exec vp test` → exit `0`, `10` files / `43` tests passed.
- Full `swz-cli` suite: `pnpm --filter @gimped/swz-cli exec vp test` → exit `0`, `1` file / `3` tests passed.
- IDE diagnostics (`ReadLints`) on touched files: no linter errors.

## Concerns

- `git commit` recorded `5 files changed`; `packages/swz/src/pipeline.ts` changes are included in diff history, but Git’s aggregate line count may appear compact because the update is type-union only.
- Existing workspace includes unrelated untracked/generated files under `packages/swz/node_modules`; they were not touched or staged in this task.
