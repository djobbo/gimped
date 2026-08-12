# Task 6 Report: JSON Transpile + Registry

## Status

Implemented and committed Task 6.

Commit: `cd9f59c feat(swz): json transpile mode with registry`

## Changes

- Added `JsonTranspile.ts` with:
  - exported `Registry` type
  - `writeJsonDir(entries, outDir)`
  - `readJsonDir(inDir)`
- Preserved entry content losslessly:
  - XML JSON stores the exact source in `xml`
  - CSV JSON stores the exact source in `text` and its first-line name in `name`
- Added `registry.json` generation with one filetype record per JSON entry.
- Reads entries in deterministic filename order.
- Maps filesystem and JSON parsing failures to `IoError`.
- Maps an absent `registry.json` to `MissingRegistry` with the registry path.
- Exported the new module from `src/index.ts`.

## TDD Evidence

RED:

- Added the round-trip, fixed-schema, package-export, and missing-registry tests first.
- `vp test src/JsonTranspile.test.ts` exited 1 because `JsonTranspile.ts` did not exist.

GREEN:

- Implemented the minimum JSON directory writer/reader and package export.
- Focused run passed: 1 file, 3 tests.

## Verification

- `vp test`: passed, 5 test files and 18 tests.
- `vp check src/JsonTranspile.ts src/JsonTranspile.test.ts`: passed formatting and lint checks.
- Cursor's lint view reports `.ts` import-extension diagnostics because it does not apply the package's Vite+ TypeScript configuration; `vp check` is clean for both Task 6 files.
- Full `vp check`: still exits 1 on pre-existing formatting issues in 7 unrelated files:
  `package.json`, `SwzCodec.ts`, `Well512.test.ts`, `Well512.ts`,
  `version-keys.json`, `tsconfig.json`, and `vite.config.ts`.

## Concerns

- Entry-derived JSON names can collide (including an entry named `registry`); the brief does not define collision handling, matching the existing native-directory naming behavior.
- Registry and entry JSON are trusted structurally after parsing. Malformed JSON becomes `IoError`, but schema validation was not requested.

## Scope

The commit contains only:

- `packages/swz/src/JsonTranspile.ts`
- `packages/swz/src/JsonTranspile.test.ts`
- `packages/swz/src/index.ts`

Existing untracked workspace material was not staged.
