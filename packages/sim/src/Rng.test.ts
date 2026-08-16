import { expect, layer } from "@effect/vitest";
import { Well512 } from "@gimped/swz";
import { Effect, Layer } from "effect";
import { Rng } from "./Rng.ts";

const Live = Rng.layer.pipe(Layer.provide(Well512.layer));

layer(Live)("Rng", (it) => {
  it.effect("matches swz Well512 sequence", () =>
    Effect.gen(function* () {
      const rng = yield* Rng;
      yield* rng.initState(0x12345678);
      expect(yield* rng.next()).toBe(0x7f031c96);
      expect(yield* rng.next()).toBe(0xe5ec2c73);
    }),
  );
});
