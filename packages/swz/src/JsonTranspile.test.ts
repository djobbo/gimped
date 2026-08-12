import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { MissingRegistry } from "./errors.ts";
import { readJsonDir, writeJsonDir } from "./JsonTranspile.ts";
import * as swz from "./index.ts";

describe("JsonTranspile", () => {
  it("exports JSON transpile functions from the package entry point", () => {
    expect(swz.writeJsonDir).toBe(writeJsonDir);
    expect(swz.readJsonDir).toBe(readJsonDir);
  });

  it("writes the fixed lossless schemas and round-trips entries", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "swz-json-"));
    const entries = [
      { content: "<HeroTypes><x/></HeroTypes>" },
      { content: "MyTable\na,b\n1,2\n" },
    ];

    try {
      await Effect.runPromise(writeJsonDir(entries, dir));

      expect(JSON.parse(await fs.readFile(path.join(dir, "HeroTypes.json"), "utf8"))).toEqual({
        filetype: "xml",
        xml: "<HeroTypes><x/></HeroTypes>",
      });
      expect(JSON.parse(await fs.readFile(path.join(dir, "MyTable.json"), "utf8"))).toEqual({
        filetype: "csv",
        name: "MyTable",
        text: "MyTable\na,b\n1,2\n",
      });
      expect(JSON.parse(await fs.readFile(path.join(dir, "registry.json"), "utf8"))).toEqual({
        files: {
          "HeroTypes.json": { filetype: "xml" },
          "MyTable.json": { filetype: "csv" },
        },
      });

      const back = await Effect.runPromise(readJsonDir(dir));
      expect(back.map((entry) => entry.content)).toEqual([
        "<HeroTypes><x/></HeroTypes>",
        "MyTable\na,b\n1,2\n",
      ]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("fails with MissingRegistry when registry.json is absent", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "swz-json-"));

    try {
      const result = await Effect.runPromise(Effect.result(readJsonDir(dir)));

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(MissingRegistry);
        expect(result.failure.path).toBe(path.join(dir, "registry.json"));
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
