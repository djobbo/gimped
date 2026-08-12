import { Effect, FileSystem, Path } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { IoError, MissingRegistry } from "./errors.ts";
import { readJsonDir, writeJsonDir } from "./JsonTranspile.ts";
import * as swz from "./index.ts";
import { JsonTranspileLive } from "./layers.ts";
import { runWith } from "./test-utils.ts";

const run = runWith(JsonTranspileLive);

describe("JsonTranspile", () => {
  it("exports JSON transpile functions from the package entry point", () => {
    expect(swz.writeJsonDir).toBe(writeJsonDir);
    expect(swz.readJsonDir).toBe(readJsonDir);
  });

  it("writes the fixed lossless schemas and round-trips entries", async () => {
    const snapshot = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectory({ prefix: "swz-json-" });
        const entries = [
          { content: "<HeroTypes><x/></HeroTypes>" },
          { content: "MyTable\na,b\n1,2\n" },
        ];

        yield* writeJsonDir(entries, dir);

        return {
          hero: JSON.parse(yield* fs.readFileString(path.join(dir, "HeroTypes.json"))),
          table: JSON.parse(yield* fs.readFileString(path.join(dir, "MyTable.json"))),
          registry: JSON.parse(yield* fs.readFileString(path.join(dir, "registry.json"))),
          back: (yield* readJsonDir(dir)).map((entry) => entry.content),
        };
      }),
    );

    expect(snapshot.hero).toEqual({
      filetype: "xml",
      xml: "<HeroTypes><x/></HeroTypes>",
    });
    expect(snapshot.table).toEqual({
      filetype: "csv",
      name: "MyTable",
      text: "MyTable\na,b\n1,2\n",
    });
    expect(snapshot.registry).toEqual({
      files: {
        "HeroTypes.json": { filetype: "xml" },
        "MyTable.json": { filetype: "csv" },
      },
    });
    expect(snapshot.back).toEqual(["<HeroTypes><x/></HeroTypes>", "MyTable\na,b\n1,2\n"]);
  });

  it("rejects entries that resolve to the same JSON filename", async () => {
    const { result, expectedPath } = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectory({ prefix: "swz-json-" });
        const result = yield* Effect.result(
          writeJsonDir(
            [
              { content: "<HeroTypes><x/></HeroTypes>" },
              { content: "<HeroTypes><y/></HeroTypes>" },
            ],
            dir,
          ),
        );
        return { result, expectedPath: path.join(dir, "HeroTypes.json") };
      }),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure).toBeInstanceOf(IoError);
      expect(result.failure.path).toBe(expectedPath);
    }
  });

  it("rejects malformed JSON entries and registry filetype mismatches", async () => {
    const cases = [
      {
        registryType: "xml" as const,
        entry: { filetype: "xml", xml: 42 },
      },
      {
        registryType: "csv" as const,
        entry: { filetype: "csv", text: null },
      },
      {
        registryType: "xml" as const,
        entry: { filetype: "csv", name: "HeroTypes", text: "HeroTypes\na,b\n" },
      },
    ];

    for (const testCase of cases) {
      const { result, filePath } = await run(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const dir = yield* fs.makeTempDirectory({ prefix: "swz-json-" });
          const filePath = path.join(dir, "entry.json");
          yield* fs.writeFileString(
            path.join(dir, "registry.json"),
            JSON.stringify({ files: { "entry.json": { filetype: testCase.registryType } } }),
          );
          yield* fs.writeFileString(filePath, JSON.stringify(testCase.entry));
          const result = yield* Effect.result(readJsonDir(dir));
          return { result, filePath };
        }),
      );

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(IoError);
        expect(result.failure.path).toBe(filePath);
      }
    }
  });

  it("fails with MissingRegistry when registry.json is absent", async () => {
    const { result, registryPath } = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectory({ prefix: "swz-json-" });
        const result = yield* Effect.result(readJsonDir(dir));
        return { result, registryPath: path.join(dir, "registry.json") };
      }),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure).toBeInstanceOf(MissingRegistry);
      expect(result.failure.path).toBe(registryPath);
    }
  });
});
