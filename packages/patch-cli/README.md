# `@gimped/patch-cli`

Effect CLI around [`@gimped/patch`](../patch). Bin: `patch`.

```
patch fetch [--manifest <id>] [--full] [--cache-dir <path>] [--version-keys <path>]
```

Reads `STEAM_USERNAME`, `STEAM_PASSWORD`, and `GIMPED_CACHE` from the process environment and a cwd `.env` file (process env wins). Prints the resulting `PatchRegistry` as JSON. If `--version-keys` is omitted and `packages/swz/src/version-keys.json` exists relative to cwd, that path is used.

Java must be on `PATH` unless the cached FFDec launcher is a self-contained exe.

From this repo:

```sh
vp run --filter @gimped/patch-cli start -- fetch
```

Full flag notes, cache layout, and env: [root README — CLI usage](../../README.md#patch).
