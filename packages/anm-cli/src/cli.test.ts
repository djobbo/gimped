import { NodeServices } from "@effect/platform-node";
import { AnimDefJsonText, IndexJsonText, layer } from "@gimped/anm";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { Command } from "effect/unstable/cli";
import { describe, expect, it } from "vite-plus/test";
import { root } from "./cli.ts";

const AppLive = layer.pipe(Layer.provideMerge(NodeServices.layer));
const runCli = (args: ReadonlyArray<string>) =>
  Command.runWith(root, { version: "0.0.0" })(args).pipe(Effect.provide(AppLive));

const run = <A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> =>
  // SAFETY: AppLive is the CLI test environment; leftover R is only from generics TS cannot prove empty.
  Effect.runPromise(Effect.provide(effect, AppLive) as Effect.Effect<A, E>);

const minimalDir = {
  index: {
    files: [{ file: "anims__Foo.swf__a__Foo.json", key: "anims/Foo.swf/a__Foo" }],
  },
  def: {
    key: "anims/Foo.swf/a__Foo",
    name: "a__Foo",
    file: "anims/Foo.swf",
    moves: [
      {
        name: "Ready",
        startFrame: 1,
        duration: 1,
        loop: 0,
        recover: 0,
        free: 0,
        iconUI: 0,
        runEnds: [],
        frames: [
          {
            index: 0,
            bones: [{ id: 1, a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, alpha: 1, gfxFrame: 1 }],
          },
        ],
      },
    ],
  },
};

describe("anm CLI", () => {
  it("exposes decompile and compile subcommands", () => {
    expect(
      root.subcommands.flatMap((group) => group.commands.map((command) => command.name)),
    ).toEqual(["decompile", "compile"]);
  });

  it("round-trips a JSON directory through compile then decompile without names", async () => {
    const { first, second } = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const temp = yield* fs.makeTempDirectory({ prefix: "anm-cli-" });
        const dirIn = path.join(temp, "in");
        const anmPath = path.join(temp, "out.anm");
        const dirOut = path.join(temp, "out");
        yield* fs.makeDirectory(dirIn);
        yield* fs.writeFileString(
          path.join(dirIn, "index.json"),
          `${Schema.encodeUnknownSync(IndexJsonText)(minimalDir.index)}\n`,
        );
        yield* fs.writeFileString(
          path.join(dirIn, "anims__Foo.swf__a__Foo.json"),
          `${Schema.encodeUnknownSync(AnimDefJsonText)(minimalDir.def)}\n`,
        );
        yield* runCli(["compile", "--in", dirIn, "--out", anmPath]);
        yield* runCli(["decompile", "--in", anmPath, "--out", dirOut]);
        const firstText = yield* fs.readFileString(path.join(dirIn, "anims__Foo.swf__a__Foo.json"));
        const secondText = yield* fs.readFileString(
          path.join(dirOut, "anims__Foo.swf__a__Foo.json"),
        );
        return {
          first: yield* Schema.decodeUnknownEffect(AnimDefJsonText)(firstText),
          second: yield* Schema.decodeUnknownEffect(AnimDefJsonText)(secondText),
        };
      }),
    );
    expect(second).toEqual(first);
    expect(second.moves[0].frames[0].bones[0].name).toBeUndefined();
  });
});
