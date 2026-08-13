import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Path, Schema } from "effect";
import { IoError, MalformedCsv, MalformedJson, MissingRegistry } from "./errors.ts";
import * as swz from "./index.ts";
import { JsonEntryText, readJsonDir, writeJsonDir } from "./JsonTranspile.ts";
import { JsonTranspileLive } from "./layers.ts";
import { RegistryText } from "./registry.ts";
import { xmlToJson } from "./xmlCodec.ts";

layer(JsonTranspileLive)("JsonTranspile", (it) => {
  it("exports JSON transpile functions from the package entry point", () => {
    expect(swz.writeJsonDir).toBe(writeJsonDir);
    expect(swz.readJsonDir).toBe(readJsonDir);
  });

  it.effect("writes the fixed lossless schemas and round-trips entries", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectory({ prefix: "swz-json-" });
      const entries = [
        { content: "<HeroTypes><x/></HeroTypes>" },
        { content: "MyTable\na,b\n1,2\n" },
      ];

      yield* writeJsonDir(entries, dir);

      const hero = yield* Schema.decodeUnknownEffect(JsonEntryText)(
        yield* fs.readFileString(path.join(dir, "HeroTypes.json")),
      );
      const table = yield* Schema.decodeUnknownEffect(JsonEntryText)(
        yield* fs.readFileString(path.join(dir, "MyTable.json")),
      );
      const registry = yield* Schema.decodeUnknownEffect(RegistryText)(
        yield* fs.readFileString(path.join(dir, "registry.json")),
      );
      const back = (yield* readJsonDir(dir)).entries.map((entry) => entry.content);

      expect(hero).toEqual({
        filetype: "xml",
        root: { HeroTypes: { x: "" } },
      });
      expect(table).toEqual({
        filetype: "csv",
        name: "MyTable",
        headers: ["a", "b"],
        rows: [{ a: "1", b: "2" }],
      });
      expect(registry).toEqual({
        files: {
          "HeroTypes.json": { filetype: "xml" },
          "MyTable.json": { filetype: "csv" },
        },
      });
      expect(back[1]).toBe("MyTable\na,b\n1,2\n");
      const xmlAgain = yield* xmlToJson(back[0]!, "HeroTypes.xml");
      expect(hero.filetype).toBe("xml");
      if (hero.filetype === "xml") {
        expect(xmlAgain.root).toEqual(hero.root);
      }
    }),
  );

  it.effect("writes shared-root XML entries as distinct JSON files", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectory({ prefix: "swz-json-" });
      yield* writeJsonDir(
        [
          { content: '<LevelDesc LevelName="Atlas_2v2"><x/></LevelDesc>' },
          { content: '<LevelDesc LevelName="Batavia"><y/></LevelDesc>' },
        ],
        dir,
      );
      const registry = yield* Schema.decodeUnknownEffect(RegistryText)(
        yield* fs.readFileString(path.join(dir, "registry.json")),
      );
      expect(Object.keys(registry.files)).toEqual([
        "LevelDesc_Atlas_2v2.json",
        "LevelDesc_Batavia.json",
      ]);
    }),
  );

  it.effect("rejects entries that resolve to the same JSON filename", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectory({ prefix: "swz-json-" });
      const result = yield* Effect.result(
        writeJsonDir(
          [{ content: "<HeroTypes><x/></HeroTypes>" }, { content: "<HeroTypes><y/></HeroTypes>" }],
          dir,
        ),
      );
      const expectedPath = path.join(dir, "HeroTypes.json");
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(IoError);
        expect(result.failure.path).toBe(expectedPath);
      }
    }),
  );

  it.effect.each([
    {
      expected: "MalformedJson" as const,
      registryType: "xml" as const,
      entry: { filetype: "xml", xml: 42 },
    },
    {
      expected: "MalformedJson" as const,
      registryType: "csv" as const,
      entry: { filetype: "csv", text: null },
    },
    {
      expected: "IoError" as const,
      registryType: "xml" as const,
      entry: {
        filetype: "csv",
        name: "HeroTypes",
        headers: ["a", "b"],
        rows: [{ a: "1", b: "2" }],
      },
    },
    {
      expected: "MalformedCsv" as const,
      registryType: "csv" as const,
      entry: {
        filetype: "csv",
        name: "MyTable",
        headers: ["a", "a"],
        rows: [{ a: "1" }],
      },
    },
  ])(
    "rejects malformed JSON entries, malformed CSV payloads, and registry filetype mismatches",
    (testCase) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectory({ prefix: "swz-json-" });
        const filePath = path.join(dir, "entry.json");
        yield* fs.writeFileString(
          path.join(dir, "registry.json"),
          Schema.encodeUnknownSync(RegistryText)({
            files: { "entry.json": { filetype: testCase.registryType } },
          }),
        );
        yield* fs.writeFileString(
          filePath,
          Schema.encodeUnknownSync(Schema.UnknownFromJsonString)(testCase.entry),
        );
        const result = yield* Effect.result(readJsonDir(dir));
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          if (testCase.expected === "MalformedJson") {
            expect(result.failure).toBeInstanceOf(MalformedJson);
            expect(result.failure.path).toBe(filePath);
          } else if (testCase.expected === "MalformedCsv") {
            expect(result.failure).toBeInstanceOf(MalformedCsv);
            expect(result.failure.path).toBe(filePath);
          } else {
            expect(result.failure).toBeInstanceOf(IoError);
            expect(result.failure.path).toBe(filePath);
          }
        }
      }),
  );

  it.effect("fails with MissingRegistry when registry.json is absent", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectory({ prefix: "swz-json-" });
      const result = yield* Effect.result(readJsonDir(dir));
      const registryPath = path.join(dir, "registry.json");
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(MissingRegistry);
        expect(result.failure.path).toBe(registryPath);
      }
    }),
  );

  it.effect("preserves seed and non-alphabetical order via registry.json", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectory({ prefix: "swz-json-" });
      const entries = [
        { content: "<ZooTypes><z/></ZooTypes>" },
        { content: "<AppleTypes><a/></AppleTypes>" },
      ];
      yield* writeJsonDir(entries, dir, { seed: 481516234 });
      const back = yield* readJsonDir(dir);
      const registry = yield* Schema.decodeUnknownEffect(RegistryText)(
        yield* fs.readFileString(path.join(dir, "registry.json")),
      );
      expect(registry.seed).toBe(481516234);
      expect(Object.keys(registry.files)).toEqual(["ZooTypes.json", "AppleTypes.json"]);
      expect(back.seed).toBe(481516234);
      expect(back.entries.map((entry) => entry.content.startsWith("<ZooTypes"))).toEqual([
        true,
        false,
      ]);
    }),
  );
});
