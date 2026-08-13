import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import { Bitstream } from "./bitstream.ts";
import { ChecksumMismatch, InvalidReplay } from "./errors.ts";
import { CodecLive } from "./layers.ts";
import { chunkTypes, decode, encode } from "./ReplayCodec.ts";
import type { Replay } from "./ReplayJson.ts";

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

const withColorScheme = (replay: Replay, colorSchemeId: number): Replay => ({
  ...replay,
  players: replay.players.map((player) => ({ ...player, colorSchemeId })),
});

/**
 * Two encodings that differ only in `colorSchemeId` have the same bit layout, so every
 * differing byte belongs to either that field or the trailing setup checksum. Copying the
 * last one across leaves the players intact but stores a checksum they do not produce.
 */
const corruptSetupChecksum = (bytes: Uint8Array, other: Uint8Array): Uint8Array => {
  let last = -1;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] !== other[i]) last = i;
  const out = Uint8Array.from(bytes);
  out[last] = other[last]!;
  return out;
};

layer(CodecLive)("ReplayCodec", (it) => {
  it.effect("round-trips a minimal replay", () =>
    Effect.gen(function* () {
      const replay = minimal();
      const decoded = yield* encode(replay).pipe(Effect.flatMap(decode));
      expect(decoded).toEqual(replay);
    }),
  );

  it.effect("round-trips input rows that carry an input value", () =>
    Effect.gen(function* () {
      const replay: Replay = { ...minimal(), inputs: [{ entityId: 1, time: 16, input: 512 }] };
      const decoded = yield* encode(replay).pipe(Effect.flatMap(decode));
      expect(decoded).toEqual(replay);
    }),
  );

  it.effect("round-trips scores, events and a handicap", () =>
    Effect.gen(function* () {
      const base = minimal();
      const replay: Replay = {
        ...base,
        game: { id: 2, nameId: 7, nameKey: "UI_Offline_Couch_Party", customOnline: true },
        players: base.players.map((player) => ({
          ...player,
          cosmetics: { ...player.cosmetics, bitfield: [3, 5] },
          handicap: { lives: 2, statA: 100, statB: 50 },
        })),
        results: { duration: 900, scores: [{ entityId: 1, score: 2 }], endValue: 3 },
        inputs: [
          { entityId: 1, time: 16, input: 512 },
          { entityId: 1, time: 32 },
        ],
        events: [{ entityId: 1, time: 1000 }],
        otherEvents: [{ entityId: 2, time: 2000 }],
      };
      const decoded = yield* encode(replay).pipe(Effect.flatMap(decode));
      expect(decoded).toEqual(replay);
    }),
  );

  it.effect("fails when the setup checksum does not match the players", () =>
    Effect.gen(function* () {
      const bytes = yield* encode(minimal());
      const other = yield* encode(withColorScheme(minimal(), 7));
      const result = yield* Effect.result(decode(corruptSetupChecksum(bytes, other)));
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(ChecksumMismatch);
    }),
  );

  it.effect("fails when the replay declares more than five hero slots", () =>
    Effect.gen(function* () {
      const bits = new Bitstream();
      bits.writeU32(268);
      bits.writeBits(4, 4);
      for (let i = 0; i < 15; i++) bits.writeU32(0);
      bits.writeU32(1);
      bits.writeU16(6);
      const result = yield* Effect.result(decode(bits.toUint8Array()));
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(InvalidReplay);
        if (result.failure instanceof InvalidReplay) {
          expect(result.failure.reason).toContain("hero slot");
        }
      }
    }),
  );

  it.effect("writes chunks in order 3, 4, 6, 1, 5, 7, 2", () =>
    Effect.gen(function* () {
      const bytes = yield* encode(minimal());
      expect(chunkTypes(bytes)).toEqual([3, 4, 6, 1, 5, 7, 2]);
    }),
  );

  it.effect("fails encode when a player has more heroes than heroSlotCount", () =>
    Effect.gen(function* () {
      const base = minimal();
      const extra = { heroId: 4, costumeId: 0, field3172: 0, weaponSkinId: 0 };
      const replay: Replay = {
        ...base,
        heroSlotCount: 1,
        players: base.players.map((player) => ({
          ...player,
          heroes: [...player.heroes, extra],
        })),
      };
      const result = yield* Effect.result(encode(replay));
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(InvalidReplay);
    }),
  );

  it.effect("fails on a truncated bitstream", () =>
    Effect.gen(function* () {
      const bytes = yield* encode(minimal());
      const result = yield* Effect.result(decode(bytes.subarray(0, 20)));
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(InvalidReplay);
        if (result.failure instanceof InvalidReplay) {
          expect(result.failure.reason).toBe("truncated");
        }
      }
    }),
  );
});
