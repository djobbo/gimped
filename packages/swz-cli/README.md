# `@gimped/swz-cli`

Effect CLI around [`@gimped/swz`](../swz). Bin: `swz`.

```
swz decompile --in <file.swz> --out <dir> [--version <id|alias>] [--json]
swz compile   --in <dir>      --out <file.swz> [--version <id|alias>] [--json]
```

`--version` defaults to `latest`. `--json` writes or reads structured JSON plus `registry.json`; without it, native `.xml` / `.csv`.

From this repo:

```sh
vp run --filter @gimped/swz-cli start -- decompile --in Game.swz --out ./game
```

Full flag notes and examples: [root README — CLI usage](../../README.md#swz).
