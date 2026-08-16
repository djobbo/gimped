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

  it.effect("ground jump leaves the floor with upward vy", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const kinematics = yield* Fighter;
      const stage = boxStage();

      yield* match.replace({
        timeMs: 0,
        gameSpeed: 100,
        ended: false,
        fighters: [fighter({ y: 0, grounded: true, input: InputBits.jump, prevInput: 0 })],
        lines: stage.lines,
        spawns: stage.spawns,
        bounds: stage.bounds,
        startingLives: 3,
        inputs: [],
      });

      yield* kinematics.step();
      const state = yield* match.get();
      expect(state.fighters[0]?.vy).toBeLessThan(0);
      expect(state.fighters[0]?.grounded).toBe(false);
    }),
  );

  it.effect("allows two air jumps then ignores a third", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const kinematics = yield* Fighter;
      const stage = boxStage();

      const pressJump = (airJumpsUsed: number) =>
        match.replace({
          timeMs: 0,
          gameSpeed: 100,
          ended: false,
          fighters: [
            fighter({
              y: -80,
              grounded: false,
              airJumpsUsed,
              input: InputBits.jump,
              prevInput: 0,
              vy: 0,
            }),
          ],
          lines: stage.lines,
          spawns: stage.spawns,
          bounds: stage.bounds,
          startingLives: 3,
          inputs: [],
        });

      yield* pressJump(0);
      yield* kinematics.step();
      let state = yield* match.get();
      expect(state.fighters[0]?.airJumpsUsed).toBe(1);
      expect(state.fighters[0]?.vy).toBeLessThan(0);

      yield* pressJump(1);
      yield* kinematics.step();
      state = yield* match.get();
      expect(state.fighters[0]?.airJumpsUsed).toBe(2);
      expect(state.fighters[0]?.vy).toBeLessThan(0);

      // Gravity-only control (no jump press).
      const GRAVITY = 3.75;
      const DT = 0.384;
      const gravityOnlyVy = 0 + GRAVITY * DT;

      yield* pressJump(2);
      yield* kinematics.step();
      state = yield* match.get();
      expect(state.fighters[0]?.airJumpsUsed).toBe(2);
      expect(state.fighters[0]?.vy).toBeCloseTo(gravityOnlyVy, 5);
    }),
  );

  it.effect("wall jump pushes away from the wall with upward vy", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const kinematics = yield* Fighter;
      const stage = boxStage();
      const wall = { startX: 0, startY: -80, endX: 0, endY: 0, type: 1 as const };

      yield* match.replace({
        timeMs: 0,
        gameSpeed: 100,
        ended: false,
        fighters: [
          fighter({
            x: 0,
            y: -40,
            grounded: false,
            input: InputBits.jump,
            prevInput: 0,
          }),
        ],
        lines: [...stage.lines, wall],
        spawns: stage.spawns,
        bounds: stage.bounds,
        startingLives: 3,
        inputs: [],
      });

      yield* kinematics.step();
      const state = yield* match.get();
      expect(state.fighters[0]?.vx).not.toBe(0);
      expect(state.fighters[0]?.vy).toBeLessThan(0);
    }),
  );

  it.effect("wall jump keeps dump vx when direction is also held", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const kinematics = yield* Fighter;
      const stage = boxStage();
      const wall = { startX: 0, startY: -80, endX: 0, endY: 0, type: 1 as const };
      // On/right of wall → wallSide 1 → vx = -48 (away). Holding right would otherwise set vx = runSpeed.
      const JUMP_WALL_X = 48;

      yield* match.replace({
        timeMs: 0,
        gameSpeed: 100,
        ended: false,
        fighters: [
          fighter({
            x: 0,
            y: -40,
            grounded: false,
            runSpeed: 30,
            input: InputBits.jump | InputBits.right,
            prevInput: 0,
          }),
        ],
        lines: [...stage.lines, wall],
        spawns: stage.spawns,
        bounds: stage.bounds,
        startingLives: 3,
        inputs: [],
      });

      yield* kinematics.step();
      const state = yield* match.get();
      expect(state.fighters[0]?.vx).toBe(-JUMP_WALL_X);
      expect(state.fighters[0]?.vx).not.toBe(30);
    }),
  );

  it.effect("grounded spot dodge sets dodgeFrames 18 and zeros vy", () =>
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
            y: 0,
            grounded: true,
            vy: 10,
            input: InputBits.dodge,
            prevInput: 0,
          }),
        ],
        lines: stage.lines,
        spawns: stage.spawns,
        bounds: stage.bounds,
        startingLives: 3,
        inputs: [],
      });

      yield* kinematics.step();
      const state = yield* match.get();
      expect(state.fighters[0]?.dodgeFrames).toBe(18);
      expect(state.fighters[0]?.vy).toBe(0);
    }),
  );

  it.effect("same-frame dodge+jump is ground spot dodge, not jump or air dodge", () =>
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
            y: 0,
            grounded: true,
            input: InputBits.dodge | InputBits.jump,
            prevInput: 0,
          }),
        ],
        lines: stage.lines,
        spawns: stage.spawns,
        bounds: stage.bounds,
        startingLives: 3,
        inputs: [],
      });

      yield* kinematics.step();
      const state = yield* match.get();
      // Dodge runs before jump; successful dodge consumes the frame (dump class_288).
      expect(state.fighters[0]?.dodgeFrames).toBe(18);
      expect(state.fighters[0]?.dodgeFrames).not.toBe(22);
      expect(state.fighters[0]?.vy).toBe(0);
      expect(state.fighters[0]?.grounded).toBe(true);
    }),
  );

  it.effect("grounded side dodge sets dodgeFrames 14 and dashing", () =>
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
            y: 0,
            grounded: true,
            input: InputBits.dodge | InputBits.right,
            prevInput: 0,
          }),
        ],
        lines: stage.lines,
        spawns: stage.spawns,
        bounds: stage.bounds,
        startingLives: 3,
        inputs: [],
      });

      yield* kinematics.step();
      const state = yield* match.get();
      expect(state.fighters[0]?.dodgeFrames).toBe(14);
      expect(state.fighters[0]?.dashing).toBe(true);
    }),
  );

  it.effect("dash-jump uses stronger upward impulse than ground jump", () =>
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
            y: 0,
            grounded: true,
            dashing: true,
            input: InputBits.jump,
            prevInput: 0,
          }),
        ],
        lines: stage.lines,
        spawns: stage.spawns,
        bounds: stage.bounds,
        startingLives: 3,
        inputs: [],
      });

      yield* kinematics.step();
      const state = yield* match.get();
      // Dash-jump: vy -= 170; normal ground jump: vy -= 57.
      expect(state.fighters[0]?.vy).toBeLessThan(-57);
      expect(state.fighters[0]?.vy).toBeCloseTo(-170, 5);
    }),
  );

  it.effect("fast-fall raises fall-speed cap while holding down", () =>
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
            vy: 50,
            input: 0,
          }),
          fighter({
            entityId: 2,
            team: 2,
            y: -80,
            grounded: false,
            vy: 50,
            input: InputBits.down,
          }),
        ],
        // No floor — otherwise both land and vy resets to 0 before the cap can differ.
        lines: [],
        spawns: stage.spawns,
        bounds: stage.bounds,
        startingLives: 3,
        inputs: [],
      });

      for (let i = 0; i < 20; i++) {
        yield* kinematics.step();
      }

      const state = yield* match.get();
      const normal = state.fighters.find((f) => f.entityId === 1);
      const fast = state.fighters.find((f) => f.entityId === 2);
      expect(fast?.vy ?? 0).toBeGreaterThan(normal?.vy ?? 0);
      expect(normal?.vy ?? 0).toBeLessThanOrEqual(70);
      expect(fast?.vy ?? 0).toBeLessThanOrEqual(85);
    }),
  );
});
