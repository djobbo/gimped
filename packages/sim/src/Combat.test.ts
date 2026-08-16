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

  it.effect("higher impulseMult knocks the victim farther", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const combat = yield* Combat;

      yield* seed(match, [
        fighter(1, 1, { x: 0, input: ATTACK_BIT, impulseMult: 1 }),
        fighter(2, 2, { x: 40 }),
      ]);
      for (let i = 0; i < STARTUP_PLUS_ACTIVE; i++) {
        yield* combat.step();
      }
      const weak = (yield* match.get()).fighters.find((f) => f.entityId === 2)?.vx ?? 0;

      yield* seed(match, [
        fighter(1, 1, { x: 0, input: ATTACK_BIT, impulseMult: 2 }),
        fighter(2, 2, { x: 40 }),
      ]);
      for (let i = 0; i < STARTUP_PLUS_ACTIVE; i++) {
        yield* combat.step();
      }
      const strong = (yield* match.get()).fighters.find((f) => f.entityId === 2)?.vx ?? 0;
      expect(Math.abs(strong)).toBeGreaterThan(Math.abs(weak));
    }),
  );

  it.effect("smaller stored recoverMod shortens unarmed nlight recover", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const combat = yield* Combat;

      yield* seed(match, [
        fighter(1, 1, { x: 0, input: ATTACK_BIT, recoverMod: 1 }),
        fighter(2, 2, { x: 400 }),
      ]);
      for (let i = 0; i < 9; i++) {
        yield* combat.step();
      }
      const slow = (yield* match.get()).fighters.find((f) => f.entityId === 1)?.attackFrames ?? 0;

      yield* seed(match, [
        fighter(1, 1, { x: 0, input: ATTACK_BIT, recoverMod: 0.5 }),
        fighter(2, 2, { x: 400 }),
      ]);
      for (let i = 0; i < 9; i++) {
        yield* combat.step();
      }
      const fast = (yield* match.get()).fighters.find((f) => f.entityId === 1)?.attackFrames ?? 0;
      expect(slow).toBeGreaterThan(0);
      expect(fast).toBe(0);
    }),
  );

  it.effect("nlight does not hit a dodging victim", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const combat = yield* Combat;

      yield* seed(match, [
        fighter(1, 1, { x: 0, input: ATTACK_BIT }),
        fighter(2, 2, { x: 40, dodgeFrames: 18 }),
      ]);

      for (let i = 0; i < STARTUP_PLUS_ACTIVE; i++) {
        yield* combat.step();
      }

      const state = yield* match.get();
      const victim = state.fighters.find((f) => f.entityId === 2)!;
      expect(victim.damage).toBe(0);
    }),
  );
});
