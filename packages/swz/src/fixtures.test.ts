import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { ChecksumMismatch } from "./errors.ts";
import { compile, decompile } from "./SwzCodec.ts";
import { resolveKey } from "./VersionKeys.ts";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

const FIXTURES = ["Engine.swz", "Init.swz", "Dynamic.swz", "Game.swz"] as const;

const readFixture = (name: (typeof FIXTURES)[number]): Uint8Array =>
  new Uint8Array(fs.readFileSync(path.join(fixturesDir, name)));

describe("real SWZ fixtures", () => {
  it.each(FIXTURES)("decompiles %s with version latest key", async (name) => {
    const key = await Effect.runPromise(resolveKey("latest"));
    const entries = await Effect.runPromise(decompile(readFixture(name), key));
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.content.length).toBeGreaterThan(0);
      const trimmed = entry.content.trimStart();
      expect(trimmed.startsWith("<") || trimmed.includes("\n")).toBe(true);
    }
  });

  it.each(FIXTURES)("rejects %s with the wrong key", async (name) => {
    const result = await Effect.runPromise(Effect.result(decompile(readFixture(name), 1)));
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure).toBeInstanceOf(ChecksumMismatch);
      if (result.failure instanceof ChecksumMismatch) {
        expect(result.failure.where).toBe("header");
      }
    }
  });

  it.each(FIXTURES)("round-trips %s entry contents through compile/decompile", async (name) => {
    const key = await Effect.runPromise(resolveKey("latest"));
    const original = await Effect.runPromise(decompile(readFixture(name), key));
    const rebuilt = await Effect.runPromise(compile(original, key, 731341442));
    const roundTrip = await Effect.runPromise(decompile(rebuilt, key));
    expect(roundTrip.map((entry) => entry.content)).toEqual(original.map((entry) => entry.content));
  });
});
