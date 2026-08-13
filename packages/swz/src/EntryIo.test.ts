import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Path, Schema } from "effect";
import { IoError } from "./errors.ts";
import { detectFiletype, entryFileName, readNativeDir, writeNativeDir } from "./EntryIo.ts";
import * as swz from "./index.ts";
import { EntryIoLive } from "./layers.ts";
import { RegistryText } from "./registry.ts";

layer(EntryIoLive)("EntryIo", (it) => {
  it("exports entry helpers from the package entry point", () => {
    expect(swz.entryFileName).toBe(entryFileName);
    expect(swz.readNativeDir).toBe(readNativeDir);
  });

  it("detects XML after leading whitespace and otherwise CSV", () => {
    expect(detectFiletype(" \n<HeroTypes/>")).toBe("xml");
    expect(detectFiletype("MyTable\na,b\n")).toBe("csv");
  });

  it("names XML from its root tag", () => {
    expect(entryFileName("<HeroTypes></HeroTypes>")).toBe("HeroTypes.xml");
  });

  it("names shared-root XML from a name or title attribute", () => {
    expect(entryFileName('<LevelDesc LevelName="Atlas_2v2"></LevelDesc>')).toBe(
      "LevelDesc_Atlas_2v2.xml",
    );
    expect(entryFileName('<CutsceneType CutsceneName="BP4C"></CutsceneType>')).toBe(
      "CutsceneType_BP4C.xml",
    );
    expect(entryFileName('<Thing name="Alpha"></Thing>')).toBe("Thing_Alpha.xml");
    expect(entryFileName('<Thing title="Beta"></Thing>')).toBe("Thing_Beta.xml");
  });

  it("prefers a name attribute over other *Name attributes", () => {
    expect(entryFileName('<LevelDesc name="Keep" LevelName="Drop"></LevelDesc>')).toBe(
      "LevelDesc_Keep.xml",
    );
  });

  it("names CSV from its first line and strips carriage returns", () => {
    expect(entryFileName("MyTable\r\na,b\r\n")).toBe("MyTable.csv");
  });

  it("sanitizes Windows-illegal filename characters", () => {
    expect(entryFileName('My<Table>:*?|"\na,b\n')).toBe("My_Table______.csv");
  });

  it.effect("writes and reads a native directory deterministically", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectory({ prefix: "swz-" });
      const entries = [
        { content: "<HeroTypes><x/></HeroTypes>" },
        { content: "MyTable\na,b\n1,2\n" },
      ];

      yield* writeNativeDir(entries, dir);
      yield* fs.writeFileString(path.join(dir, "ignored.txt"), "ignored");
      const back = yield* readNativeDir(dir);
      const registry = yield* Schema.decodeUnknownEffect(RegistryText)(
        yield* fs.readFileString(path.join(dir, "registry.json")),
      );
      expect(back.entries.map((entry) => entry.content)).toEqual([
        "<HeroTypes><x/></HeroTypes>",
        "MyTable\na,b\n1,2\n",
      ]);
      expect(back.seed).toBeUndefined();
      expect(Object.keys(registry.files)).toEqual(["HeroTypes.xml", "MyTable.csv"]);
    }),
  );

  it.effect("writes shared-root XML entries as distinct files", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectory({ prefix: "swz-" });
      yield* writeNativeDir(
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
        "LevelDesc_Atlas_2v2.xml",
        "LevelDesc_Batavia.xml",
      ]);
    }),
  );

  it.effect("rejects entries that resolve to the same native filename", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectory({ prefix: "swz-" });
      const result = yield* Effect.result(
        writeNativeDir(
          [{ content: "<HeroTypes><x/></HeroTypes>" }, { content: "<HeroTypes><y/></HeroTypes>" }],
          dir,
        ),
      );
      const expectedPath = path.join(dir, "HeroTypes.xml");
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(IoError);
        expect(result.failure.path).toBe(expectedPath);
      }
    }),
  );

  it.effect("maps filesystem failures to IoError", () =>
    Effect.gen(function* () {
      const missing = `C:\\missing-swz-${crypto.randomUUID()}`;
      const result = yield* Effect.result(readNativeDir(missing));
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(IoError);
        expect(result.failure.path).toBe(missing);
      }
    }),
  );

  it.effect("preserves seed and non-alphabetical order via registry.json", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectory({ prefix: "swz-" });
      const entries = [
        { content: "<ZooTypes><z/></ZooTypes>" },
        { content: "<AppleTypes><a/></AppleTypes>" },
      ];
      yield* writeNativeDir(entries, dir, { seed: 481516234 });
      const back = yield* readNativeDir(dir);
      const registry = yield* Schema.decodeUnknownEffect(RegistryText)(
        yield* fs.readFileString(path.join(dir, "registry.json")),
      );
      expect(registry.seed).toBe(481516234);
      expect(Object.keys(registry.files)).toEqual(["ZooTypes.xml", "AppleTypes.xml"]);
      expect(back.seed).toBe(481516234);
      expect(back.entries.map((entry) => entry.content)).toEqual([
        "<ZooTypes><z/></ZooTypes>",
        "<AppleTypes><a/></AppleTypes>",
      ]);
    }),
  );
});
