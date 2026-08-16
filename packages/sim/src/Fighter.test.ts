import { expect, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { Collision } from "./Collision.ts";
import type { FighterState } from "./domain.ts";
import { InputBits } from "./domain.ts";
import { Fighter } from "./Fighter.ts";
import { boxStage } from "./fixtures.ts";
import { Match } from "./Match.ts";

const Live = Fighter.layer.pipe(
  Layer.provideMerge(Collision.layer),
  Layer.provideMerge(Match.layer),
);

const fighter = (overrides: Partial<FighterState> = {}): FighterState => ({
  entityId: 1,
  team: 1,
  x: 0,
  y: -80,
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
  ...overrides,
});

layer(Live)("Fighter", (it) => {
  it.effect("lands on hard floor then walks +x", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const kinematics = yield* Fighter;
      const stage = boxStage();

      yield* match.replace({
        timeMs: 0,
        gameSpeed: 100,
        ended: false,
        fighters: [fighter()],
        lines: stage.lines,
        spawns: stage.spawns,
        bounds: stage.bounds,
        startingLives: 3,
        inputs: [],
      });

      for (let i = 0; i < 120; i++) {
        yield* kinematics.step();
      }

      let state = yield* match.get();
      const landed = state.fighters[0];
      expect(landed?.grounded).toBe(true);
      expect(landed?.y).toBeCloseTo(0, 1);

      yield* match.modify((s) => {
        const next = s.fighters[0];
        if (next !== undefined) {
          next.input = InputBits.right;
        }
      });

      for (let i = 0; i < 30; i++) {
        yield* kinematics.step();
      }

      state = yield* match.get();
      expect(state.fighters[0]?.x).toBeGreaterThan(0);
    }),
  );

  it.effect("decrements stun and walks after it expires", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const kinematics = yield* Fighter;
      const stage = boxStage();

      yield* match.replace({
        timeMs: 0,
        gameSpeed: 100,
        ended: false,
        fighters: [fighter({ y: 0, grounded: true, stun: 1, input: InputBits.right })],
        lines: stage.lines,
        spawns: stage.spawns,
        bounds: stage.bounds,
        startingLives: 3,
        inputs: [],
      });

      yield* kinematics.step();
      let state = yield* match.get();
      expect(state.fighters[0]?.stun).toBe(0);
      expect(state.fighters[0]?.x).toBe(0);

      yield* kinematics.step();
      state = yield* match.get();
      expect(state.fighters[0]?.x).toBeGreaterThan(0);
    }),
  );

  it.effect("higher runSpeed walks farther in the same steps", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const kinematics = yield* Fighter;
      const stage = boxStage();

      yield* match.replace({
        timeMs: 0,
        gameSpeed: 100,
        ended: false,
        fighters: [
          fighter({ entityId: 1, y: 0, grounded: true, runSpeed: 30, input: InputBits.right }),
          fighter({
            entityId: 2,
            team: 2,
            y: 0,
            grounded: true,
            runSpeed: 50,
            input: InputBits.right,
          }),
        ],
        lines: stage.lines,
        spawns: stage.spawns,
        bounds: stage.bounds,
        startingLives: 3,
        inputs: [],
      });

      for (let i = 0; i < 10; i++) {
        yield* kinematics.step();
      }

      const state = yield* match.get();
      const slow = state.fighters.find((f) => f.entityId === 1);
      const fast = state.fighters.find((f) => f.entityId === 2);
      expect(fast?.x ?? 0).toBeGreaterThan(slow?.x ?? 0);
    }),
  );

  it.effect("higher recovery decays knockback speed faster while stunned", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const kinematics = yield* Fighter;
      const stage = boxStage();

      yield* match.replace({
        timeMs: 0,
        gameSpeed: 100,
        ended: false,
        fighters: [
          fighter({
            entityId: 1,
            y: -80,
            grounded: false,
            stun: 20,
            vx: 20,
            vy: -10,
            recovery: 4,
          }),
          fighter({
            entityId: 2,
            team: 2,
            y: -80,
            grounded: false,
            stun: 20,
            vx: 20,
            vy: -10,
            recovery: 20,
          }),
        ],
        lines: stage.lines,
        spawns: stage.spawns,
        bounds: stage.bounds,
        startingLives: 3,
        inputs: [],
      });

      for (let i = 0; i < 5; i++) {
        yield* kinematics.step();
      }

      const state = yield* match.get();
      const light = state.fighters.find((f) => f.entityId === 1);
      const heavy = state.fighters.find((f) => f.entityId === 2);
      const lightSpeed = Math.hypot(light?.vx ?? 0, light?.vy ?? 0);
      const heavySpeed = Math.hypot(heavy?.vx ?? 0, heavy?.vy ?? 0);
      expect(heavySpeed).toBeLessThan(lightSpeed);
    }),
  );
});
