import { expect, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import type { FighterState } from "./domain.ts";
import { boxStage } from "./fixtures.ts";
import { Items } from "./Items.ts";
import { Match } from "./Match.ts";

const Live = Items.layer.pipe(Layer.provideMerge(Match.layer));

const fighter = (entityId: number): FighterState => ({
  entityId,
  team: entityId,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  grounded: false,
  facingLeft: false,
  lives: 3,
  damage: 0,
  score: 0,
  input: undefined,
  hurtW: 50,
  hurtH: 80,
  stun: 0,
  ko: false,
  lastHitBy: undefined,
});

layer(Live)("Items", (it) => {
  it.effect("step leaves fighter count unchanged", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const items = yield* Items;
      const stage = boxStage();

      yield* match.replace({
        timeMs: 0,
        gameSpeed: 100,
        ended: false,
        fighters: [fighter(1)],
        lines: stage.lines,
        spawns: stage.spawns,
        bounds: stage.bounds,
        startingLives: 3,
        inputs: [],
      });

      yield* items.step();
      const state = yield* match.get();
      expect(state.fighters).toHaveLength(1);
    }),
  );
});
