import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { IoError, MissingRegistry } from "./errors.ts";
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

  it("rejects entries that resolve to the same JSON filename", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "swz-json-"));
    const entries = [
      { content: "<HeroTypes><x/></HeroTypes>" },
      { content: "<HeroTypes><y/></HeroTypes>" },
    ];

    try {
      const result = await Effect.runPromise(Effect.result(writeJsonDir(entries, dir)));

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(IoError);
        expect(result.failure.path).toBe(path.join(dir, "HeroTypes.json"));
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects malformed JSON entries and registry filetype mismatches", async () => {
    const cases = [
      {
        registryType: "xml",
        entry: { filetype: "xml", xml: 42 },
      },
      {
        registryType: "csv",
        entry: { filetype: "csv", text: null },
      },
      {
        registryType: "xml",
        entry: { filetype: "csv", name: "HeroTypes", text: "HeroTypes\na,b\n" },
      },
    ] as const;

    for (const testCase of cases) {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "swz-json-"));
      const filePath = path.join(dir, "entry.json");

      try {
        await fs.writeFile(
          path.join(dir, "registry.json"),
          JSON.stringify({ files: { "entry.json": { filetype: testCase.registryType } } }),
        );
        await fs.writeFile(filePath, JSON.stringify(testCase.entry));

        const result = await Effect.runPromise(Effect.result(readJsonDir(dir)));
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure).toBeInstanceOf(IoError);
          expect(result.failure.path).toBe(filePath);
        }
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
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
