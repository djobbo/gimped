import { expect, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { player, replay1v1, replay2v2, stockTables } from "./fixtures.ts";
import { MatchRules } from "./MatchRules.ts";
import { Tables } from "./Tables.ts";

const Live = MatchRules.layer.pipe(Layer.provide(Tables.make(stockTables())));

layer(Live)("MatchRules", (it) => {
  it.effect("accepts replay1v1", () =>
    Effect.gen(function* () {
      const rules = yield* MatchRules;
      yield* rules.check(replay1v1());
    }),
  );

  it.effect("accepts replay2v2", () =>
    Effect.gen(function* () {
      const rules = yield* MatchRules;
      yield* rules.check(replay2v2());
    }),
  );

  it.effect("rejects scoringTypeId 2", () =>
    Effect.gen(function* () {
      const rules = yield* MatchRules;
      const base = replay1v1();
      const error = yield* rules
        .check({ ...base, rules: { ...base.rules, scoringTypeId: 2 } })
        .pipe(Effect.flip);
      expect(error._tag).toBe("UnsupportedMatch");
    }),
  );

  it.effect("rejects 3 players", () =>
    Effect.gen(function* () {
      const rules = yield* MatchRules;
      const base = replay1v1();
      const error = yield* rules
        .check({
          ...base,
          players: [player(1, 1, "A"), player(2, 2, "B"), player(3, 1, "C")],
        })
        .pipe(Effect.flip);
      expect(error._tag).toBe("UnsupportedMatch");
    }),
  );

  it.effect("rejects heroSlotCount 2", () =>
    Effect.gen(function* () {
      const rules = yield* MatchRules;
      const error = yield* rules.check({ ...replay1v1(), heroSlotCount: 2 }).pipe(Effect.flip);
      expect(error._tag).toBe("UnsupportedMatch");
    }),
  );

  it.effect("rejects weaponSpawnRateId 1", () =>
    Effect.gen(function* () {
      const rules = yield* MatchRules;
      const base = replay1v1();
      const error = yield* rules
        .check({ ...base, rules: { ...base.rules, weaponSpawnRateId: 1 } })
        .pipe(Effect.flip);
      expect(error._tag).toBe("UnsupportedMatch");
    }),
  );

  it.effect("rejects gadgetSpawnRateId 1", () =>
    Effect.gen(function* () {
      const rules = yield* MatchRules;
      const base = replay1v1();
      const error = yield* rules
        .check({ ...base, rules: { ...base.rules, gadgetSpawnRateId: 1 } })
        .pipe(Effect.flip);
      expect(error._tag).toBe("UnsupportedMatch");
    }),
  );

  it.effect("rejects four players all on one team", () =>
    Effect.gen(function* () {
      const rules = yield* MatchRules;
      const error = yield* rules
        .check({
          ...replay2v2(),
          players: [player(1, 1, "A"), player(2, 1, "B"), player(3, 1, "C"), player(4, 1, "D")],
        })
        .pipe(Effect.flip);
      expect(error._tag).toBe("UnsupportedMatch");
    }),
  );

  it.effect("rejects 3v1 roster", () =>
    Effect.gen(function* () {
      const rules = yield* MatchRules;
      const error = yield* rules
        .check({
          ...replay2v2(),
          players: [player(1, 1, "A"), player(2, 1, "B"), player(3, 1, "C"), player(4, 2, "D")],
        })
        .pipe(Effect.flip);
      expect(error._tag).toBe("UnsupportedMatch");
    }),
  );
});
