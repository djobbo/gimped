### Task 8: Effect v4 CLI

**Files:**

- Create: `packages/swz-cli/src/cli.ts`, `packages/swz-cli/src/commands/decompile.ts`, `packages/swz-cli/src/commands/compile.ts`
- Modify: `packages/swz-cli/src/bin.ts`
- Test: optional `packages/swz-cli/src/cli.test.ts` using `Command.runWith` + test layers (recommended smoke test)

**Interfaces:**

- Consumes: `@gimped/swz` pipeline
- Produces: bin `swz` with:

```
swz decompile --in <file> --out <dir> [--version latest] [--json]
swz compile   --in <dir>  --out <file> [--version latest] [--json]
```

Pattern (Effect 4):

```ts
import { Effect } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { decompileFile, compileFile } from "@gimped/swz";

const shared = {
  in: Flag.file("in").pipe(Flag.withDescription("Input path")),
  out: Flag.file("out").pipe(Flag.withDescription("Output path")),
  version: Flag.string("version").pipe(Flag.withDefault("latest")),
  json: Flag.boolean("json").pipe(Flag.withDefault(false)),
};

const decompile = Command.make("decompile", shared, (cfg) =>
  decompileFile({
    inPath: cfg.in,
    outPath: cfg.out,
    version: cfg.version,
    json: cfg.json,
  }),
).pipe(Command.withDescription("Decompile a .swz archive"));

const compile = Command.make("compile", shared, (cfg) =>
  compileFile({
    inPath: cfg.in,
    outPath: cfg.out,
    version: cfg.version,
    json: cfg.json,
  }),
).pipe(Command.withDescription("Compile a directory into .swz"));

export const root = Command.make("swz").pipe(
  Command.withDescription("Brawlhalla SWZ tools"),
  Command.withSubcommands([decompile, compile]),
);
```

`bin.ts`:

```ts
#!/usr/bin/env node
import { Effect } from "effect";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Command } from "effect/unstable/cli";
import { root } from "./cli.ts";

NodeRuntime.runMain(
  Command.run(root, { version: "0.0.0" }).pipe(Effect.provide(NodeServices.layer)),
);
```

If `Flag.file` API differs in beta.107, use `Flag.string("in")` instead (check `.repos/effect/packages/effect/src/unstable/cli/Flag.ts`).

- [ ] **Step 1: Implement CLI modules**

- [ ] **Step 2: Manual smoke**

```bash
cd packages/swz
node --experimental-strip-types -e "/* compile fixture via pipeline in a one-liner test already covered */"
pnpm --filter @gimped/swz-cli start -- decompile --help
```

Expected: help text lists `decompile` / `compile` and flags.

- [ ] **Step 3: End-to-end via CLI**

Create temp dir; use library in a small script **or** CLI after building fixture:

```bash
pnpm --filter @gimped/swz-cli start -- decompile --in <fixture.swz> --out <dir>
pnpm --filter @gimped/swz-cli start -- compile --in <dir> --out <out.swz>
pnpm --filter @gimped/swz-cli start -- decompile --in <fixture.swz> --out <dir-json> --json
pnpm --filter @gimped/swz-cli start -- compile --in <dir-json> --out <out2.swz> --json
```

Expected: exit 0; entry contents match across round-trips.

- [ ] **Step 4: Commit**

```bash
git add packages/swz-cli
git commit -m "$(cat <<'EOF'
feat(swz-cli): Effect v4 decompile/compile commands

EOF
)"
```

---
