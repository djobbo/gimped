# Task 9 Report: Workspace verification

## Status

Complete. All package tests pass. No regressions found; no code changes or commits required.

## Step 1: Package tests

Command: `npx pnpm@10.14.0 -r test`

| Package           | Test files | Tests | Result |
| ----------------- | ---------- | ----- | ------ |
| `@gimped/swz`     | 6          | 21    | PASS   |
| `@gimped/swz-cli` | 1          | 3     | PASS   |

**Total: 24 tests, 0 failures.**

## Step 2: Check

### Root (`pnpm check`)

**FAIL** — pre-existing, not introduced by SWZ work.

```
Failed to load config in .../.repos/vite-plus/crates/vp_cli_snapshots/tests/cli_snapshots/fixtures/check_fix_missing_stderr/vite.config.ts
Error: The `fmt` field in the default export must be an object.
```

Root `vp check` traverses the vendored `.repos/vite-plus` snapshot fixtures and aborts before analyzing project packages.

### Per-package check

| Package           | Format         | Lint           | Result                 |
| ----------------- | -------------- | -------------- | ---------------------- |
| `@gimped/swz-cli` | pass (8 files) | pass (6 files) | PASS                   |
| `@gimped/swz`     | fail (7 files) | —              | FAIL (formatting only) |

`@gimped/swz` formatting drift affects `package.json`, `SwzCodec.ts`, `Well512.*`, `version-keys.json`, `tsconfig.json`, `vite.config.ts`. Pre-existing cosmetic issue; tests unaffected. Not fixed in this task per brief scope.

## Step 3: Success criteria checklist

| #   | Criterion                                  | Evidence                                                                                                                                                      | Status |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Vite+ monorepo at root with both packages  | Root `vite.config.ts` (`defineConfig` from `vite-plus`); `pnpm-workspace.yaml` lists `packages/*`; `@gimped/swz` and `@gimped/swz-cli` under `packages/`      | PASS   |
| 2   | Decompile/compile with key `762411009`     | `SwzCodec.test.ts` round-trip; `pipeline.test.ts` and `cli.test.ts` compile fixtures with `762411009`                                                         | PASS   |
| 3   | Entry-equal round-trip                     | Native round-trip in `SwzCodec.test.ts`, `pipeline.test.ts`, `cli.test.ts` — entry contents compared and equal after decompile→compile→decompile              | PASS   |
| 4   | `--json` registry round-trip               | `JsonTranspile.test.ts` writes/reads `registry.json` and round-trips entries; `pipeline.test.ts` and `cli.test.ts` cover `{ format: "json" }` end-to-end      | PASS   |
| 5   | `--version latest` → `10090` / `762411009` | `version-keys.json`: `aliases.latest = "10090"`, `keys["10090"] = 762411009`; `VersionKeys.test.ts` asserts both; `pipeline.test.ts` uses `version: "latest"` | PASS   |

## Concerns (pre-existing, documented in prior tasks)

- Root `pnpm check` blocked by `.repos/vite-plus` fixture configs.
- `@gimped/swz` has formatting drift (7 files); run `vp check --fix` in that package to resolve.
- `@gimped/swz` / `@gimped/swz-cli` `vp build` expects `index.html` (noted in Task 8 report); build not part of this verification scope.

## Changes

None.

## Fix: Final review findings

Implemented the final whole-branch review fixes:

- Enabled TypeScript extension imports and Vite+ type-aware checking in both packages.
- Added typed `IoError` failures for native and JSON filename collisions.
- Added JSON entry shape validation and registry/file filetype mismatch rejection.
- Froze the Well512 known sequence, fixed checksum-error narrowing, formatted `@gimped/swz`,
  removed unused `fast-xml-parser`, and excluded `.repos/**` from root lint/format.

Verification:

- `npx pnpm@10.14.0 -r test` — PASS (27 tests across both packages).
- `npx pnpm@10.14.0 --filter @gimped/swz exec tsc --noEmit` — PASS.
- `npx pnpm@10.14.0 --filter @gimped/swz-cli exec tsc --noEmit` — PASS.
- `npx pnpm@10.14.0 run check` in `packages/swz` — PASS (0 errors; one pre-existing
  `no-control-regex` warning).
- `npx pnpm@10.14.0 run check` in `packages/swz-cli` — PASS (0 warnings/errors).
- Root `npx pnpm@10.14.0 run check` no longer traverses `.repos/**`; it still reports formatting
  drift in untracked task artifacts/docs and root configuration files.
