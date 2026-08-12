import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { compile, decompile } from "./SwzCodec.ts";

describe("SwzCodec", () => {
  it("round-trips entries with key 762411009", async () => {
    const key = 762411009;
    const entries = [
      { content: '<HeroTypes><Hero name="test"/></HeroTypes>' },
      { content: "SomeTable\na,b\n1,2\n" },
    ];
    const bytes = await Effect.runPromise(compile(entries, key, 731341442));
    const out = await Effect.runPromise(decompile(bytes, key));
    expect(out.map((entry) => entry.content)).toEqual(entries.map((entry) => entry.content));
  });

  it("fails header checksum on wrong key", async () => {
    const bytes = await Effect.runPromise(compile([{ content: "<A/>" }], 762411009, 1));
    const result = await Effect.runPromise(Effect.result(decompile(bytes, 1)));
    expect(result._tag).toBe("Failure");
  });
});
