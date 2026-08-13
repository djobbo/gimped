import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, FileSystem, Path, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { ChecksumMismatch } from "./errors.ts";
import { TestLive } from "./layers.ts";
import { runWith } from "./test-utils.ts";
import { writeNativeDir } from "./EntryIo.ts";
import { RegistryText } from "./registry.ts";
import { compile, decompile } from "./SwzCodec.ts";
import { resolveKey } from "./VersionKeys.ts";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const FIXTURES = ["Engine.swz", "Init.swz", "Dynamic.swz", "Game.swz"] as const;

const run = runWith(TestLive);

const readFixture = (name: (typeof FIXTURES)[number]) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFile(path.join(fixturesDir, name));
  });

describe("real SWZ fixtures", () => {
  it.each(FIXTURES)("decompiles %s with version latest key", async (name) => {
    const entries = await run(
      Effect.gen(function* () {
        const key = yield* resolveKey("latest");
        const bytes = yield* readFixture(name);
        return yield* decompile(bytes, key);
      }),
    );
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.content.length).toBeGreaterThan(0);
      const trimmed = entry.content.trimStart();
      expect(trimmed.startsWith("<") || trimmed.includes("\n")).toBe(true);
    }
  });

  it.each(FIXTURES)("rejects %s with the wrong key", async (name) => {
    const result = await run(
      Effect.gen(function* () {
        const bytes = yield* readFixture(name);
        return yield* Effect.result(decompile(bytes, 1));
      }),
    );
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure).toBeInstanceOf(ChecksumMismatch);
      if (result.failure instanceof ChecksumMismatch) {
        expect(result.failure.where).toBe("header");
      }
    }
  });

  it.each(FIXTURES)("round-trips %s entry contents through compile/decompile", async (name) => {
    const { original, roundTrip } = await run(
      Effect.gen(function* () {
        const key = yield* resolveKey("latest");
        const bytes = yield* readFixture(name);
        const original = yield* decompile(bytes, key);
        const rebuilt = yield* compile(original, key, 731341442);
        const roundTrip = yield* decompile(rebuilt, key);
        return { original, roundTrip };
      }),
    );
    expect(roundTrip.map((entry) => entry.content)).toEqual(original.map((entry) => entry.content));
  });

  it("extracts Dynamic.swz maps to distinct files", async () => {
    const names = await run(
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
        return Object.keys(registry.files);
      }),
    );

    expect(names).toContain("LevelDesc_Atlas_2v2.xml");
    expect(names).toContain("CutsceneType_BP4C.xml");
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThan(100);
  });
});
