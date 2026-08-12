import { Effect, FileSystem, Path } from "effect";
import { describe, expect, it } from "vite-plus/test";
import * as swz from "./index.ts";
import { TestLive } from "./layers.ts";
import { runWith } from "./test-utils.ts";
import { compileFile, decompileFile } from "./pipeline.ts";
import { compile } from "./SwzCodec.ts";

const entries = [{ content: "<HeroTypes><x/></HeroTypes>" }, { content: "MyTable\na,b\n1,2\n" }];

const run = runWith(TestLive);

describe("file pipeline", () => {
  it("exports orchestration helpers from the package entry point", () => {
    expect(swz.decompileFile).toBe(decompileFile);
    expect(swz.compileFile).toBe(compileFile);
  });

  it.each([
    { format: "native", json: false },
    { format: "json", json: true },
  ])("round-trips entry contents through the $format path", async ({ json }) => {
    const actual = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectory({ prefix: "swz-pipeline-" });
        const sourceSwz = path.join(root, "source.swz");
        const firstDir = path.join(root, "first");
        const rebuiltSwz = path.join(root, "rebuilt.swz");
        const secondDir = path.join(root, "second");

        const bytes = yield* compile(entries, 762411009, 12345);
        yield* fs.writeFile(sourceSwz, bytes);

        yield* decompileFile({
          inPath: sourceSwz,
          outPath: firstDir,
          version: "latest",
          json,
        });
        yield* compileFile({
          inPath: firstDir,
          outPath: rebuiltSwz,
          version: "latest",
          json,
        });
        yield* decompileFile({
          inPath: rebuiltSwz,
          outPath: secondDir,
          version: "latest",
          json,
        });

        const restored = json
          ? yield* swz.readJsonDir(secondDir)
          : yield* swz.readNativeDir(secondDir);
        return restored.map((entry) => entry.content).sort();
      }),
    );

    expect(actual).toEqual(entries.map((entry) => entry.content).sort());
  });
});
