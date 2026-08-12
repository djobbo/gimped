# Task 8 Report: Effect v4 CLI

## Status

Complete. Commit `88d88f9` implements the `swz decompile` and `swz compile` command surface with Effect v4 CLI.

## Implementation

- Added the `swz` root command and `decompile` / `compile` subcommands.
- Wired command handlers to `decompileFile` and `compileFile` from `@gimped/swz`.
- Added `--in`, `--out`, `--version`, and `--json` flags. Version defaults to `latest`; JSON defaults to `false`.
- Added the Node entry point using `Command.run`, `NodeServices.layer`, and `NodeRuntime.runMain`.
- Changed the package start command to Node's `--experimental-transform-types` mode because the library contains TypeScript parameter properties that strip-only mode cannot execute.

## Verification

- `pnpm --filter @gimped/swz-cli test`: passed, 3 tests.
- `pnpm --filter @gimped/swz-cli check`: passed, all 8 files formatted and no lint warnings/errors.
- Root, decompile, and compile help output was manually exercised.
- End-to-end tests build a SWZ fixture through the library `compile` pipeline in a temporary directory, then execute CLI decompile/compile/decompile round trips in both native and JSON modes. Entry contents match after each round trip.

## API Compatibility Notes

- Effect beta.107 provides `Flag.file`, but it validates that values are files. This rejects the compile command's `--in` directory, so both path flags use the brief's `Flag.string` fallback.
- With pnpm 10, `pnpm --filter @gimped/swz-cli start -- decompile ...` forwards a literal `--` to the CLI. Use `pnpm --filter @gimped/swz-cli start decompile ...` instead.

## Concerns

- `pnpm --filter @gimped/swz-cli build` fails because the existing Vite+ configuration expects an `index.html`. The same pre-existing build configuration failure reproduces in `@gimped/swz`; it is not caused by the CLI implementation.
- Node emits an experimental warning for transform-types mode.

## Commit

`88d88f9 feat(swz-cli): Effect v4 decompile/compile commands`
