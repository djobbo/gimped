import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import { xorBytes, Xor } from "./xor.ts";

layer(Xor.layer)("xorBytes", (it) => {
  it.effect("is symmetric and uses key[i % 64]", () =>
    Effect.gen(function* () {
      const input = Uint8Array.from({ length: 70 }, (_, i) => i);
      const once = yield* xorBytes(input);
      expect(once[0]).toBe(0 ^ 107);
      expect(once[64]).toBe(64 ^ 107);
      expect([...(yield* xorBytes(once))]).toEqual([...input]);
      expect([...input]).toEqual([...Uint8Array.from({ length: 70 }, (_, i) => i)]);
    }),
  );
});
