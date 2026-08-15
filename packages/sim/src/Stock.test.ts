import { expect, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { Collision } from "./Collision.ts";
import type { FighterState } from "./domain.ts";
import { boxStage } from "./fixtures.ts";
import { Match } from "./Match.ts";
import { Stock } from "./Stock.ts";
import { World } from "./World.ts";

const Live = Stock.layer.pipe(
  Layer.provideMerge(World.layer),
  Layer.provideMerge(Collision.layer),
  Layer.provideMerge(Match.layer),
);

const fighter = (
  entityId: number,
  team: number,
  overrides: Partial<FighterState> = {},
): FighterState => ({
  entityId,
  team,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  grounded: false,
  facingLeft: false,
  lives: 1,
  damage: 0,
  score: 0,
  input: undefined,
  hurtW: 50,
  hurtH: 80,
  stun: 0,
  ko: false,
  lastHitBy: undefined,
  ...overrides,
});

const seed1v1 = (match: Match, fighters: FighterState[]) => {
  const stage = boxStage();
  return match.replace({
    timeMs: 0,
    gameSpeed: 100,
    ended: false,
    fighters,
    lines: stage.lines,
    spawns: stage.spawns,
    bounds: stage.bounds,
    startingLives: 1,
    inputs: [],
  });
};

layer(Live)("Stock", (it) => {
  it.effect("KO with lastHitBy credits score and ends match", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const stock = yield* Stock;

      yield* seed1v1(match, [fighter(1, 1, { x: 0, y: 500, lastHitBy: 2 }), fighter(2, 2)]);

      yield* stock.step();

      const state = yield* match.get();
      const f1 = state.fighters.find((f) => f.entityId === 1)!;
      const f2 = state.fighters.find((f) => f.entityId === 2)!;
      expect(f1.lives).toBe(0);
      expect(f1.ko).toBe(true);
      expect(f2.score).toBe(1);
      expect(state.ended).toBe(true);
    }),
  );

  it.effect("self-destruct does not credit score but still ends match", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const stock = yield* Stock;

      yield* seed1v1(match, [fighter(1, 1, { x: 0, y: 500 }), fighter(2, 2)]);

      yield* stock.step();

      const state = yield* match.get();
      const f1 = state.fighters.find((f) => f.entityId === 1)!;
      const f2 = state.fighters.find((f) => f.entityId === 2)!;
      expect(f1.lives).toBe(0);
      expect(f1.ko).toBe(true);
      expect(f2.score).toBe(0);
      expect(state.ended).toBe(true);
    }),
  );
});
