# `@gimped/anm-cli`

Effect CLI around [`@gimped/anm`](../anm). Bin: `anm`. JSON is the only decompile format.

```
anm decompile --in <file.anm> --out <dir> [--data <dir|.swz>]
anm compile   --in <dir>      --out <file.anm>
```

`--data` is decompile-only (BoneTypes names from SWZ). Compile ignores names.

From this repo:

```sh
vp run --filter @gimped/anm-cli start -- decompile --in Animation.anm --out ./anims
```

Full flag notes and examples: [root README — CLI usage](../../README.md#anm).
