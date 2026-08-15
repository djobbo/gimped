import { Context, Effect, Layer } from "effect";
import { Match } from "./Match.ts";
import type { SimulationFault } from "./errors.ts";

export class Clock extends Context.Service<
  Clock,
  {
    readonly advance: () => Effect.Effect<void, SimulationFault>;
  }
>()("@gimped/sim/Clock") {
  static readonly layer = Layer.effect(
    Clock,
    Effect.gen(function* () {
      const match = yield* Match;

      const advance = Effect.fn("Clock.advance")(function* () {
        yield* match.modify((s) => {
          s.timeMs += 16;
        });
      });

      return Clock.of({ advance });
    }),
  );
}
