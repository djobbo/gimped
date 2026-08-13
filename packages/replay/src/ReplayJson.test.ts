import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { ReplayJson, type Replay } from "./ReplayJson.ts";

const minimal = (): Replay => ({
  replayVersion: 268,
  game: { id: 1, nameId: 0, customOnline: false },
  rules: {
    flags: 0,
    maxPlayers: 4,
    duration: 480,
    roundDuration: 0,
    startingLives: 3,
    scoringTypeId: 1,
    scoreToWin: 0,
    gameSpeed: 100,
    damageRatio: 100,
    levelSetId: 0,
    itemSpawnRuleSetId: 0,
    weaponSpawnRateId: 0,
    gadgetSpawnRateId: 0,
    unknown12964: 0,
    variation: 0,
  },
  level: { id: 12 },
  heroSlotCount: 1,
  players: [
    {
      entityId: 1,
      team: 1,
      name: "A",
      colorSchemeId: 0,
      heroes: [{ heroId: 3, costumeId: 0, field3172: 0, weaponSkinId: 0 }],
      cosmetics: {
        spawnBotId: 0,
        companionId: 0,
        field2463: 0,
        field8849: 0,
        field11747: 0,
        tauntIds: [0, 0, 0, 0, 0, 0, 0, 0],
        field2378: 0,
        field15047: 0,
        bitfield: [],
        field4335: 0,
        field3535: 0,
        field6575: 0,
      },
      hidden: false,
    },
  ],
  results: { duration: 100, scores: [], endValue: 1 },
  inputs: [{ entityId: 1, time: 16 }],
  events: [],
  otherEvents: [],
});

describe("ReplayJson", () => {
  it.effect("round-trips a document without name keys", () =>
    Effect.gen(function* () {
      const encoded = yield* Schema.encodeUnknownEffect(ReplayJson)(minimal());
      expect(encoded).not.toHaveProperty("level.name");
      const decoded = yield* Schema.decodeUnknownEffect(ReplayJson)(encoded);
      expect(decoded.level.id).toBe(12);
      expect(decoded.level.name).toBeUndefined();
      expect(decoded.inputs[0]?.input).toBeUndefined();
    }),
  );

  it.effect("rejects missing replayVersion", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        Schema.decodeUnknownEffect(ReplayJson)({ ...minimal(), replayVersion: undefined }),
      );
      expect(result._tag).toBe("Failure");
    }),
  );

  it.effect("rejects an input entityId outside bits(5)", () =>
    Effect.gen(function* () {
      const replay = { ...minimal(), inputs: [{ entityId: 32, time: 16 }] };
      const result = yield* Effect.result(Schema.decodeUnknownEffect(ReplayJson)(replay));
      expect(result._tag).toBe("Failure");
    }),
  );

  it.effect("rejects an input value outside bits(14)", () =>
    Effect.gen(function* () {
      const replay = { ...minimal(), inputs: [{ entityId: 1, time: 16, input: 16384 }] };
      const result = yield* Effect.result(Schema.decodeUnknownEffect(ReplayJson)(replay));
      expect(result._tag).toBe("Failure");
    }),
  );

  it.effect("rejects heroSlotCount above 5", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        Schema.decodeUnknownEffect(ReplayJson)({ ...minimal(), heroSlotCount: 6 }),
      );
      expect(result._tag).toBe("Failure");
    }),
  );

  it.effect("rejects a u16 cosmetics field above 65535", () =>
    Effect.gen(function* () {
      const base = minimal();
      const replay = {
        ...base,
        players: base.players.map((player) => ({
          ...player,
          cosmetics: { ...player.cosmetics, field2378: 65536 },
        })),
      };
      const result = yield* Effect.result(Schema.decodeUnknownEffect(ReplayJson)(replay));
      expect(result._tag).toBe("Failure");
    }),
  );
});
