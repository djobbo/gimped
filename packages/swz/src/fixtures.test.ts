import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Path, Schema } from "effect";
import { ChecksumMismatch } from "./errors.ts";
import { writeNativeDir } from "./EntryIo.ts";
import { TestLive } from "./layers.ts";
import { RegistryText } from "./registry.ts";
import { compile, decompile } from "./SwzCodec.ts";
import { resolveKey } from "./VersionKeys.ts";

const FIXTURES = ["Engine.swz", "Init.swz", "Dynamic.swz", "Game.swz"] as const;

const readFixture = Effect.fn("readFixture")(function* (name: (typeof FIXTURES)[number]) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const here = yield* path.fromFileUrl(new URL(import.meta.url));
  return yield* fs.readFile(path.join(path.dirname(here), "..", "fixtures", name));
});

layer(TestLive)("real SWZ fixtures", (it) => {
  it.effect.each(FIXTURES)("decompiles %s with version latest key", (name) =>
    Effect.gen(function* () {
      const key = yield* resolveKey("latest");
      const bytes = yield* readFixture(name);
      const entries = yield* decompile(bytes, key);
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.content.length).toBeGreaterThan(0);
        const trimmed = entry.content.trimStart();
        expect(trimmed.startsWith("<") || trimmed.includes("\n")).toBe(true);
      }
    }),
  );

  it.effect.each(FIXTURES)("rejects %s with the wrong key", (name) =>
    Effect.gen(function* () {
      const bytes = yield* readFixture(name);
      const result = yield* Effect.result(decompile(bytes, 1));
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(ChecksumMismatch);
        if (result.failure instanceof ChecksumMismatch) {
          expect(result.failure.where).toBe("header");
        }
      }
    }),
  );

  it.effect.each(FIXTURES)("round-trips %s entry contents through compile/decompile", (name) =>
    Effect.gen(function* () {
      const key = yield* resolveKey("latest");
      const bytes = yield* readFixture(name);
      const original = yield* decompile(bytes, key);
      const rebuilt = yield* compile(original, key, 731341442);
      const roundTrip = yield* decompile(rebuilt, key);
      expect(roundTrip.map((entry) => entry.content)).toEqual(
        original.map((entry) => entry.content),
      );
    }),
  );

  it.effect("extracts Dynamic.swz maps to distinct files", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const key = yield* resolveKey("latest");
      const bytes = yield* readFixture("Dynamic.swz");
      const entries = yield* decompile(bytes, key);
      const dir = yield* fs.makeTempDirectory({ prefix: "swz-dynamic-" });
      yield* writeNativeDir(entries, dir);
      const registry = yield* Schema.decodeUnknownEffect(RegistryText)(
        yield* fs.readFileString(path.join(dir, "registry.json")),
      );
      const names = Object.keys(registry.files);
      expect(names).toContain("LevelDesc_Atlas_2v2.xml");
      expect(names).toContain("CutsceneType_BP4C.xml");
      expect(new Set(names).size).toBe(names.length);
      expect(names.length).toBeGreaterThan(100);
    }),
  );
});
