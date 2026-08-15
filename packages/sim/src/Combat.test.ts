import { expect, layer } from "@effect/vitest";
import { Well512 } from "@gimped/swz";
import { Effect, Layer } from "effect";
import { Collision } from "./Collision.ts";
import { Combat } from "./Combat.ts";
import { InputBits, type FighterState } from "./domain.ts";
import { boxStage, stockTables } from "./fixtures.ts";
import { Fighter } from "./Fighter.ts";
import { Match } from "./Match.ts";
import { Rng } from "./Rng.ts";
import { Tables } from "./Tables.ts";

/** Dump `class_288.as:1298` — `param2 & 32` starts unarmed light (`InputBits.attack`). */
const ATTACK_BIT = InputBits.attack;
/** Dump `powerTypes.csv` BaseNeutral `CastTime` `5:2@2-2` — startup 5 + active 2. */
const STARTUP_PLUS_ACTIVE = 7;

const Live = Combat.layer.pipe(
  Layer.provideMerge(Fighter.layer),
  Layer.provideMerge(Collision.layer),
  Layer.provideMerge(Match.layer),
  Layer.provideMerge(Rng.layer.pipe(Layer.provide(Well512.layer))),
  Layer.provide(Tables.make(stockTables())),
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
  grounded: true,
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
  ...overrides,
});

const seed = (match: Match, fighters: FighterState[]) => {
  const stage = boxStage();
  return match.replace({
    timeMs: 0,
    gameSpeed: 100,
    ended: false,
    fighters,
    lines: stage.lines,
    spawns: stage.spawns,
    bounds: stage.bounds,
    startingLives: 3,
    inputs: [],
  });
};

layer(Live)("Combat", (it) => {
  it.effect("unarmed nlight hits overlapping enemy", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const combat = yield* Combat;

      yield* seed(match, [fighter(1, 1, { x: 0, input: ATTACK_BIT }), fighter(2, 2, { x: 40 })]);

      for (let i = 0; i < STARTUP_PLUS_ACTIVE; i++) {
        yield* combat.step();
      }

      const state = yield* match.get();
      const victim = state.fighters.find((f) => f.entityId === 2)!;
      expect(victim.damage).toBeGreaterThan(0);
      expect(victim.lastHitBy).toBe(1);
    }),
  );

  it.effect("same-team overlap does not hit", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const combat = yield* Combat;

      yield* seed(match, [fighter(1, 1, { x: 0, input: ATTACK_BIT }), fighter(2, 1, { x: 40 })]);

      for (let i = 0; i < STARTUP_PLUS_ACTIVE; i++) {
        yield* combat.step();
      }

      const state = yield* match.get();
      const victim = state.fighters.find((f) => f.entityId === 2)!;
      expect(victim.damage).toBe(0);
      expect(victim.lastHitBy).toBeUndefined();
    }),
  );
});
