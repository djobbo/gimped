import { describe, expect, it } from "vite-plus/test";
import { xorBytes } from "./xor.ts";

describe("xorBytes", () => {
  it("is symmetric and uses key[i % 64]", () => {
    const input = Uint8Array.from({ length: 70 }, (_, i) => i);
    const once = xorBytes(input);
    expect(once[0]).toBe(0 ^ 107);
    expect(once[64]).toBe(64 ^ 107);
    expect([...xorBytes(once)]).toEqual([...input]);
    expect([...input]).toEqual([...Uint8Array.from({ length: 70 }, (_, i) => i)]);
  });
});
