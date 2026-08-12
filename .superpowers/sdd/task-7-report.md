# Task 7 report: Library orchestration helpers

## Status

Implemented and verified.

## Commit

`5b71cf2 feat(swz): decompile/compile file pipeline`

## Changes

- Added `decompileFile` and `compileFile` orchestration helpers in `packages/swz/src/pipeline.ts`.
- Mapped direct `.swz` filesystem read/write failures to `IoError`.
- Added native and JSON end-to-end round-trip integration coverage.
- Exported the pipeline API from `packages/swz/src/index.ts`.

## TDD evidence

- RED: `vp test src/pipeline.test.ts` failed because `./pipeline.ts` did not exist.
- GREEN: the targeted suite passed with 3 tests.
- Full package suite: 6 test files passed, 21 tests passed.
- Changed-file check: all 3 files correctly formatted with no lint warnings or errors.

## Concern

The unrestricted package `vp check` still reports pre-existing formatting issues in seven unrelated files. The three Task 7 files pass targeted checks.
The package's `vp build` command fails because Vite is configured with its default application entry and cannot find `index.html`; this is unrelated to the pipeline implementation.
Direct `tsc --noEmit` is also not usable with the current project configuration because `allowImportingTsExtensions` is disabled despite repository-wide `.ts` import suffixes; it additionally reports an existing test narrowing error.
