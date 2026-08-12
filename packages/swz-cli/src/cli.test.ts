import { NodeServices } from "@effect/platform-node";
import { compile, layer, readJsonDir, readNativeDir } from "@gimped/swz";
import { Effect, FileSystem, Layer, Path } from "effect";
import { Command } from "effect/unstable/cli";
import { describe, expect, it } from "vite-plus/test";
import { root } from "./cli.ts";

const entries = [{ content: "<HeroTypes><x/></HeroTypes>" }, { content: "MyTable\na,b\n1,2\n" }];
const AppLive = layer.pipe(Layer.provideMerge(NodeServices.layer));
const runCli = (args: ReadonlyArray<string>) =>
  Command.runWith(root, { version: "0.0.0" })(args).pipe(Effect.provide(AppLive));

const run = <A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> =>
  Effect.runPromise(Effect.provide(effect, AppLive) as Effect.Effect<A, E>);

describe("swz CLI", () => {
  it("exposes decompile and compile subcommands", () => {
    expect(
      root.subcommands.flatMap((group) => group.commands.map((command) => command.name)),
    ).toEqual(["decompile", "compile"]);
  });

  it.each([
    { format: "native", json: false },
    { format: "json", json: true },
  ])("round-trips entry contents through the $format commands", async ({ json }) => {
    const actual = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const temp = yield* fs.makeTempDirectory({ prefix: "swz-cli-" });
        const sourceSwz = path.join(temp, "source.swz");
        const firstDir = path.join(temp, "first");
        const rebuiltSwz = path.join(temp, "rebuilt.swz");
        const secondDir = path.join(temp, "second");
        const jsonFlag = json ? (["--json"] as const) : ([] as const);

        yield* fs.writeFile(sourceSwz, yield* compile(entries, 762411009, 12345));
        yield* runCli(["decompile", "--in", sourceSwz, "--out", firstDir, ...jsonFlag]);
        yield* runCli(["compile", "--in", firstDir, "--out", rebuiltSwz, ...jsonFlag]);
        yield* runCli(["decompile", "--in", rebuiltSwz, "--out", secondDir, ...jsonFlag]);

        const restored = json ? yield* readJsonDir(secondDir) : yield* readNativeDir(secondDir);
        return restored.map((entry) => entry.content).sort();
      }),
    );

    expect(actual).toEqual(entries.map((entry) => entry.content).sort());
  });
});
