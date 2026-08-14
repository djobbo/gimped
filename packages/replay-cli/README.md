# `@gimped/replay-cli`

Effect CLI around [`@gimped/replay`](../replay). Bin: `replay`.

```
replay decompile --in <file.replay> --out <file.json> [--data <dir|.swz>]
replay compile   --in <file.json>   --out <file.replay>
```

`--data` is decompile-only (ID → name from SWZ tables). Compile ignores names.

From this repo:

```sh
vp run --filter @gimped/replay-cli start -- decompile --in match.replay --out match.json
```

Full flag notes and examples: [root README — CLI usage](../../README.md#replay).
