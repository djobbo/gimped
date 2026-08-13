import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import { Well512Live } from "./layers.ts";
import { createWell512 } from "./Well512.ts";

layer(Well512Live)("Well512", (it) => {
  it.effect("matches known sequence for seed 0x12345678", () =>
    Effect.gen(function* () {
      const prng = yield* createWell512();
      prng.initState(0x12345678);
      expect(prng.next()).toBe(0x7f031c96);
      expect(prng.next()).toBe(0xe5ec2c73);
      expect(prng.next()).toBe(0xe7bbd603);
    }),
  );
});
