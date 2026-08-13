import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { ChecksumMismatch } from "./errors.ts";
import { CodecLive } from "./layers.ts";
import { runWith } from "./test-utils.ts";
import { compile, decompile, seedFromHeader } from "./SwzCodec.ts";

const run = runWith(CodecLive);

describe("SwzCodec", () => {
  it("round-trips entries with key 762411009", async () => {
    const key = 762411009;
    const entries = [
      { content: '<HeroTypes><Hero name="test"/></HeroTypes>' },
      { content: "SomeTable\na,b\n1,2\n" },
    ];
    const bytes = await run(compile(entries, key, 731341442));
    const out = await run(decompile(bytes, key));
    expect(out.map((entry) => entry.content)).toEqual(entries.map((entry) => entry.content));
  });

  it("fails header checksum on wrong key", async () => {
    const bytes = await run(compile([{ content: "<A/>" }], 762411009, 1));
    const result = await run(Effect.result(decompile(bytes, 1)));
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure).toBeInstanceOf(ChecksumMismatch);
      if (result.failure instanceof ChecksumMismatch) {
        expect(result.failure.where).toBe("header");
      }
    }
  });

  it("produces different bytes without seed but same entry contents", async () => {
    const key = 762411009;
    const entries = [{ content: '<HeroTypes><Hero name="test"/></HeroTypes>' }];
    const bytes1 = await run(compile(entries, key));
    const bytes2 = await run(compile(entries, key));
    expect(bytes1).not.toEqual(bytes2);
    const out1 = await run(decompile(bytes1, key));
    const out2 = await run(decompile(bytes2, key));
    expect(out1.map((entry) => entry.content)).toEqual(entries.map((entry) => entry.content));
    expect(out2.map((entry) => entry.content)).toEqual(entries.map((entry) => entry.content));
  });

  it("reads the compile seed back from the header", async () => {
    const key = 762411009;
    const seed = 481516234;
    const bytes = await run(compile([{ content: "<A/>" }], key, seed));
    expect(seedFromHeader(bytes, key)).toBe(seed);
  });
});
