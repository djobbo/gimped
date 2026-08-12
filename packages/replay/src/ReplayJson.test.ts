import { Effect, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
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
  it("round-trips a document without name keys", async () => {
    const encoded = await Effect.runPromise(Schema.encodeUnknownEffect(ReplayJson)(minimal()));
    expect(encoded).not.toHaveProperty("level.name");
    const decoded = await Effect.runPromise(Schema.decodeUnknownEffect(ReplayJson)(encoded));
    expect(decoded.level.id).toBe(12);
    expect(decoded.level.name).toBeUndefined();
    expect(decoded.inputs[0]?.input).toBeUndefined();
  });

  it("rejects missing replayVersion", async () => {
    const result = await Effect.runPromise(
      Effect.result(Schema.decodeUnknownEffect(ReplayJson)({ ...minimal(), replayVersion: undefined })),
    );
    expect(result._tag).toBe("Failure");
  });
});
