import { expect, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { Collision } from "./Collision.ts";
import { boxStage } from "./fixtures.ts";
import { Match } from "./Match.ts";
import { World } from "./World.ts";

const Live = World.layer.pipe(
  Layer.provideMerge(Collision.layer.pipe(Layer.provideMerge(Match.layer))),
);

layer(Live)("World", (it) => {
  it.effect("blastzones and spawnFor", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const world = yield* World;
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

      expect(yield* world.inBlastzone(0, 0)).toBe(false);
      expect(yield* world.inBlastzone(0, 500)).toBe(true);

      expect(yield* world.spawnFor(1, 0)).toEqual({ x: -80, y: -50, team: 1 });
    }),
  );
});
