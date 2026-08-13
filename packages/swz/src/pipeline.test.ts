import { Effect, FileSystem, Path, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import * as swz from "./index.ts";
import { TestLive } from "./layers.ts";
import { runWith } from "./test-utils.ts";
import { compileFile, decompileFile } from "./pipeline.ts";
import { compile, seedFromHeader } from "./SwzCodec.ts";
import { xmlToJson } from "./xmlCodec.ts";
import { REGISTRY_FILENAME, RegistryText } from "./registry.ts";
import { entryFileName } from "./EntryIo.ts";

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
        return restored.entries.map((entry) => entry.content);
      }),
    );

    if (!json) {
      expect(actual).toEqual(entries.map((entry) => entry.content));
      return;
    }

    const csv = actual.find((content) => !content.trimStart().startsWith("<"));
    const xml = actual.find((content) => content.trimStart().startsWith("<"));
    expect(csv).toBe("MyTable\na,b\n1,2\n");
    expect(xml).toBeDefined();

    const originalXml = entries[0]!.content;
    const [a, b] = await Promise.all([
      run(xmlToJson(originalXml, "x.xml")),
      run(xmlToJson(xml!, "x.xml")),
    ]);
    expect(b.root).toEqual(a.root);
  });

  it.each([
    { format: "native", json: false },
    { format: "json", json: true },
  ])("preserves seed and entry order through the $format path", async ({ json }) => {
    const ordered = [
      { content: "<ZooTypes><z/></ZooTypes>" },
      { content: "<AppleTypes><a/></AppleTypes>" },
    ];
    const actual = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectory({ prefix: "swz-pipeline-" });
        const sourceSwz = path.join(root, "source.swz");
        const firstDir = path.join(root, "first");
        const rebuiltSwz = path.join(root, "rebuilt.swz");
        const seed = 481516234;
        const key = 762411009;

        yield* fs.writeFile(sourceSwz, yield* compile(ordered, key, seed));
        yield* decompileFile({
          inPath: sourceSwz,
          outPath: firstDir,
          version: "latest",
          json,
        });
        const registry = yield* Schema.decodeUnknownEffect(RegistryText)(
          yield* fs.readFileString(path.join(firstDir, REGISTRY_FILENAME)),
        );
        yield* compileFile({
          inPath: firstDir,
          outPath: rebuiltSwz,
          version: "latest",
          json,
        });
        const rebuilt = yield* fs.readFile(rebuiltSwz);
        const rebuiltEntries = yield* swz.decompile(rebuilt, key);
        return {
          registrySeed: registry.seed,
          registryFiles: Object.keys(registry.files),
          rebuiltSeed: seedFromHeader(rebuilt, key),
          rebuiltNames: rebuiltEntries.map((entry) => entryFileName(entry.content)),
        };
      }),
    );

    expect(actual.registrySeed).toBe(481516234);
    expect(actual.rebuiltSeed).toBe(481516234);
    expect(actual.rebuiltNames).toEqual(["ZooTypes.xml", "AppleTypes.xml"]);
    expect(actual.registryFiles).toEqual(
      json ? ["ZooTypes.json", "AppleTypes.json"] : ["ZooTypes.xml", "AppleTypes.xml"],
    );
  });
});
