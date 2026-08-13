import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { compile, layer as swzLayer, readJsonDir, readNativeDir, xmlToJson } from "@gimped/swz";
import { Effect, FileSystem, Layer, Path } from "effect";
import { Command } from "effect/unstable/cli";
import { root } from "./cli.ts";

const entries = [{ content: "<HeroTypes><x/></HeroTypes>" }, { content: "MyTable\na,b\n1,2\n" }];
const AppLive = swzLayer.pipe(Layer.provideMerge(NodeServices.layer));
const runCli = (args: ReadonlyArray<string>) => Command.runWith(root, { version: "0.0.0" })(args);

layer(AppLive)("swz CLI", (it) => {
  it("exposes decompile and compile subcommands", () => {
    expect(
      root.subcommands.flatMap((group) => group.commands.map((command) => command.name)),
    ).toEqual(["decompile", "compile"]);
  });

  it.effect.each([
    { format: "native", json: false },
    { format: "json", json: true },
  ])("round-trips entry contents through the $format commands", ({ json }) =>
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
      const actual = restored.entries.map((entry) => entry.content);

      if (!json) {
        expect(actual.sort()).toEqual(entries.map((entry) => entry.content).sort());
        return;
      }

      const csv = actual.find((content) => !content.trimStart().startsWith("<"));
      const xml = actual.find((content) => content.trimStart().startsWith("<"));
      expect(csv).toBe("MyTable\na,b\n1,2\n");
      expect(xml).toBeDefined();

      const a = yield* xmlToJson(entries[0]!.content, "x.xml");
      const b = yield* xmlToJson(xml!, "x.xml");
      expect(b.root).toEqual(a.root);
    }),
  );
});
