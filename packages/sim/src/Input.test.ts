import { expect, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import type { FighterState } from "./domain.ts";
import { boxStage } from "./fixtures.ts";
import { Input } from "./Input.ts";
import { Match } from "./Match.ts";

const Live = Input.layer.pipe(Layer.provideMerge(Match.layer));

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

layer(Live)("Input", (it) => {
  it.effect("apply held replay input masks", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const input = yield* Input;
      const stage = boxStage();

      yield* match.replace({
        timeMs: 0,
        gameSpeed: 100,
        ended: false,
        fighters: [fighter(1), fighter(2)],
        lines: stage.lines,
        spawns: stage.spawns,
        bounds: stage.bounds,
        startingLives: 3,
        inputs: [],
      });

      yield* input.load([
        { entityId: 1, time: 16, input: 8 },
        { entityId: 1, time: 48 },
        { entityId: 2, time: 16, input: 4 },
      ]);

      yield* input.apply();
      let state = yield* match.get();
      expect(state.fighters.find((f) => f.entityId === 1)?.input).toBeUndefined();
      expect(state.fighters.find((f) => f.entityId === 2)?.input).toBeUndefined();

      yield* match.modify((s) => {
        s.timeMs = 16;
      });
      yield* input.apply();
      state = yield* match.get();
      expect(state.fighters.find((f) => f.entityId === 1)?.input).toBe(8);
      expect(state.fighters.find((f) => f.entityId === 2)?.input).toBe(4);

      yield* match.modify((s) => {
        s.timeMs = 48;
      });
      yield* input.apply();
      state = yield* match.get();
      expect(state.fighters.find((f) => f.entityId === 1)?.input).toBeUndefined();
      expect(state.fighters.find((f) => f.entityId === 2)?.input).toBe(4);
    }),
  );
});
