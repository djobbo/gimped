import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { compile } from "./SwzCodec.ts";
import { compileFile, decompileFile } from "./pipeline.ts";
import * as swz from "./index.ts";

const entries = [{ content: "<HeroTypes><x/></HeroTypes>" }, { content: "MyTable\na,b\n1,2\n" }];

describe("file pipeline", () => {
  it("exports orchestration helpers from the package entry point", () => {
    expect(swz.decompileFile).toBe(decompileFile);
    expect(swz.compileFile).toBe(compileFile);
  });

  it.each([
    { format: "native", json: false },
    { format: "json", json: true },
  ])("round-trips entry contents through the $format path", async ({ json }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "swz-pipeline-"));
    const sourceSwz = path.join(root, "source.swz");
    const firstDir = path.join(root, "first");
    const rebuiltSwz = path.join(root, "rebuilt.swz");
    const secondDir = path.join(root, "second");

    try {
      const bytes = await Effect.runPromise(compile(entries, 762411009, 12345));
      await fs.writeFile(sourceSwz, bytes);

      await Effect.runPromise(
        decompileFile({
          inPath: sourceSwz,
          outPath: firstDir,
          version: "latest",
          json,
        }),
      );
      await Effect.runPromise(
        compileFile({
          inPath: firstDir,
          outPath: rebuiltSwz,
          version: "latest",
          json,
        }),
      );
      await Effect.runPromise(
        decompileFile({
          inPath: rebuiltSwz,
          outPath: secondDir,
          version: "latest",
          json,
        }),
      );

      const expected = entries.map((entry) => entry.content).sort();
      const actual = json
        ? await Effect.runPromise(swz.readJsonDir(secondDir))
        : await Effect.runPromise(swz.readNativeDir(secondDir));
      expect(actual.map((entry) => entry.content).sort()).toEqual(expected);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
