import { runWith } from "@gimped/common";
import { describe, expect, it } from "vite-plus/test";
import { xorBytes, Xor } from "./xor.ts";

const run = runWith(Xor.layer);

describe("xorBytes", () => {
  it("is symmetric and uses key[i % 64]", async () => {
    const input = Uint8Array.from({ length: 70 }, (_, i) => i);
    const once = await run(xorBytes(input));
    expect(once[0]).toBe(0 ^ 107);
    expect(once[64]).toBe(64 ^ 107);
    expect([...(await run(xorBytes(once)))]).toEqual([...input]);
    expect([...input]).toEqual([...Uint8Array.from({ length: 70 }, (_, i) => i)]);
  });
});
