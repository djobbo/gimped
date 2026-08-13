import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import { ChecksumMismatch } from "./errors.ts";
import { CodecLive } from "./layers.ts";
import { compile, decompile, seedFromHeader } from "./SwzCodec.ts";

layer(CodecLive)("SwzCodec", (it) => {
  it.effect("round-trips entries with key 762411009", () =>
    Effect.gen(function* () {
      const key = 762411009;
      const entries = [
        { content: '<HeroTypes><Hero name="test"/></HeroTypes>' },
        { content: "SomeTable\na,b\n1,2\n" },
      ];
      const bytes = yield* compile(entries, key, 731341442);
      const out = yield* decompile(bytes, key);
      expect(out.map((entry) => entry.content)).toEqual(entries.map((entry) => entry.content));
    }),
  );

  it.effect("fails header checksum on wrong key", () =>
    Effect.gen(function* () {
      const bytes = yield* compile([{ content: "<A/>" }], 762411009, 1);
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

  it.effect("produces different bytes without seed but same entry contents", () =>
    Effect.gen(function* () {
      const key = 762411009;
      const entries = [{ content: '<HeroTypes><Hero name="test"/></HeroTypes>' }];
      const bytes1 = yield* compile(entries, key);
      const bytes2 = yield* compile(entries, key);
      expect(bytes1).not.toEqual(bytes2);
      const out1 = yield* decompile(bytes1, key);
      const out2 = yield* decompile(bytes2, key);
      expect(out1.map((entry) => entry.content)).toEqual(entries.map((entry) => entry.content));
      expect(out2.map((entry) => entry.content)).toEqual(entries.map((entry) => entry.content));
    }),
  );

  it.effect("reads the compile seed back from the header", () =>
    Effect.gen(function* () {
      const key = 762411009;
      const seed = 481516234;
      const bytes = yield* compile([{ content: "<A/>" }], key, seed);
      expect(seedFromHeader(bytes, key)).toBe(seed);
    }),
  );
});
