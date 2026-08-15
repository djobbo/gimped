import { expect, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { Clock } from "./Clock.ts";
import { boxStage } from "./fixtures.ts";
import { Match } from "./Match.ts";

const Live = Clock.layer.pipe(Layer.provideMerge(Match.layer));

layer(Live)("Clock", (it) => {
  it.effect("get before replace fails with no match", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const error = yield* match.get().pipe(Effect.flip);
      expect(error._tag).toBe("SimulationFault");
      expect(error.reason).toBe("no match");
    }),
  );

  it.effect("advance adds 16ms per tick", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const clock = yield* Clock;
      const stage = boxStage();

      yield* match.replace({
        timeMs: 0,
        gameSpeed: 100,
        ended: false,
        fighters: [],
        lines: stage.lines,
        spawns: stage.spawns,
        bounds: stage.bounds,
        startingLives: 3,
      });

      yield* clock.advance();
      yield* clock.advance();

      const state = yield* match.get();
      expect(state.timeMs).toBe(32);
    }),
  );
});
