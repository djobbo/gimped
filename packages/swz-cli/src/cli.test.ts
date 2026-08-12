import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { NodeServices } from "@effect/platform-node";
import { compile, readJsonDir, readNativeDir } from "@gimped/swz";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { describe, expect, it } from "vite-plus/test";
import { root } from "./cli.ts";

const entries = [{ content: "<HeroTypes><x/></HeroTypes>" }, { content: "MyTable\na,b\n1,2\n" }];
const runCli = (args: ReadonlyArray<string>) =>
  Command.runWith(root, { version: "0.0.0" })(args).pipe(Effect.provide(NodeServices.layer));

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
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "swz-cli-"));
    const sourceSwz = path.join(temp, "source.swz");
    const firstDir = path.join(temp, "first");
    const rebuiltSwz = path.join(temp, "rebuilt.swz");
    const secondDir = path.join(temp, "second");
    const jsonFlag = json ? ["--json"] : [];

    try {
      await fs.writeFile(sourceSwz, await Effect.runPromise(compile(entries, 762411009, 12345)));
      await Effect.runPromise(
        runCli(["decompile", "--in", sourceSwz, "--out", firstDir, ...jsonFlag]),
      );
      await Effect.runPromise(
        runCli(["compile", "--in", firstDir, "--out", rebuiltSwz, ...jsonFlag]),
      );
      await Effect.runPromise(
        runCli(["decompile", "--in", rebuiltSwz, "--out", secondDir, ...jsonFlag]),
      );

      const actual = json
        ? await Effect.runPromise(readJsonDir(secondDir))
        : await Effect.runPromise(readNativeDir(secondDir));
      expect(actual.map((entry) => entry.content).sort()).toEqual(
        entries.map((entry) => entry.content).sort(),
      );
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  });
});
