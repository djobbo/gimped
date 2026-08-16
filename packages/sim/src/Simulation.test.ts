import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import { replay1v1 } from "./fixtures.ts";
import { TestLive } from "./layers.ts";
import { Match } from "./Match.ts";
import { create, snapshot, step } from "./Simulation.ts";

layer(TestLive)("Simulation", (it) => {
  it.effect("create then one step advances clock and keeps two fighters", () =>
    Effect.gen(function* () {
      yield* create(replay1v1());
      yield* step();
      const snap = yield* snapshot();
      expect(snap.timeMs).toBe(16);
      expect(snap.fighters.length).toBe(2);
    }),
  );

  it.effect("create of timed match fails UnsupportedMatch", () =>
    Effect.gen(function* () {
      const base = replay1v1();
      const error = yield* create({
        ...base,
        rules: { ...base.rules, scoringTypeId: 2 },
      }).pipe(Effect.flip);
      expect(error._tag).toBe("UnsupportedMatch");
    }),
  );

  it.effect("walk-off self-KO ends the match without crediting the other score", () =>
    Effect.gen(function* () {
      yield* create(replay1v1());
      const match = yield* Match;
      yield* match.modify((s) => {
        const fighter = s.fighters.find((f) => f.entityId === 1);
        if (fighter === undefined) {
          return;
        }
        fighter.x = 500;
        fighter.y = 0;
        // startingLives is 3; Stock only ends when a team's lives hit 0.
        fighter.lives = 1;
      });
      yield* step();
      const snap = yield* snapshot();
      expect(snap.ended).toBe(true);
      const other = snap.fighters.find((f) => f.entityId === 2);
      expect(other?.score).toBe(0);
    }),
  );
});
