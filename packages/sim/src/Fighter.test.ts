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
});
