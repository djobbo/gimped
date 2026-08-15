import { Well512 } from "@gimped/swz";
import { Context, Effect, Layer } from "effect";

export class Rng extends Context.Service<
  Rng,
  {
    readonly initState: (seed: number) => Effect.Effect<void>;
    readonly next: () => Effect.Effect<number>;
  }
>()("@gimped/sim/Rng") {
  static readonly layer = Layer.effect(
    Rng,
    Effect.gen(function* () {
      const well512 = yield* Well512;
      const instance = yield* well512.create();

      const initState = Effect.fn("Rng.initState")((seed: number) =>
        Effect.sync(() => {
          instance.initState(seed);
        }),
      );

      const next = Effect.fn("Rng.next")(() => Effect.sync(() => instance.next()));

      return Rng.of({ initState, next });
    }),
  );
}
