import { expect, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { Collision } from "./Collision.ts";
import { boxStage } from "./fixtures.ts";
import { Match } from "./Match.ts";

const Live = Collision.layer.pipe(Layer.provideMerge(Match.layer));

const hardFloor = { startX: -200, startY: 0, endX: 200, endY: 0, type: 1 as const };
const softPlatform = { startX: -100, startY: -40, endX: 100, endY: -40, type: 2 as const };
const hardFarBelow = { startX: -200, startY: 200, endX: 200, endY: 200, type: 1 as const };

layer(Live)("Collision", (it) => {
  it.effect("groundAt finds hard, soft, and misses up/off-line", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const collision = yield* Collision;
      const stage = boxStage();

      yield* match.replace({
        timeMs: 0,
        gameSpeed: 100,
        ended: false,
        fighters: [],
        lines: [hardFloor, softPlatform, hardFarBelow],
        spawns: stage.spawns,
        bounds: stage.bounds,
        startingLives: 3,
        inputs: [],
      });

      const hard = yield* collision.groundAt(0, -1, 1);
      expect(hard).toEqual(hardFloor);

      const soft = yield* collision.groundAt(0, -41, 1);
      expect(soft).toEqual(softPlatform);

      const upThroughSoft = yield* collision.groundAt(0, -30, -1);
      expect(upThroughSoft).toBeUndefined();

      const offLine = yield* collision.groundAt(500, -1, 1);
      expect(offLine).toBeUndefined();
    }),
  );
});
