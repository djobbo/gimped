import { Context, Effect, Layer } from "effect";
import { Bitstream } from "./bitstream.ts";
import { computePlayerChecksum } from "./checksum.ts";
import { ChecksumMismatch, InvalidReplay } from "./errors.ts";
import type { Replay } from "./ReplayJson.ts";

type Game = Replay["game"];
type Rules = Replay["rules"];
type Level = Replay["level"];
type Player = Replay["players"][number];
type TauntIds = Player["cosmetics"]["tauntIds"];
type Hero = Player["heroes"][number];
type Results = Replay["results"];
type Score = Results["scores"][number];
type Input = Replay["inputs"][number];
type EntityEvent = Replay["events"][number];

const RULE_KEYS = [
  "flags",
  "maxPlayers",
  "duration",
  "roundDuration",
  "startingLives",
  "scoringTypeId",
  "scoreToWin",
  "gameSpeed",
  "damageRatio",
  "levelSetId",
  "itemSpawnRuleSetId",
  "weaponSpawnRateId",
  "gadgetSpawnRateId",
  "unknown12964",
  "variation",
] as const;

const MAX_HERO_SLOTS = 5;

/** Carries a typed decode failure out of the synchronous reader. */
class DecodeFailure extends Error {
  constructor(readonly failure: InvalidReplay | ChecksumMismatch) {
    super(failure._tag);
  }
}

const writeGame = (bits: Bitstream, game: Game): void => {
  bits.writeBits(4, 3);
  bits.writeU32(game.id);
  bits.writeU32(game.nameId);
  if (game.nameId !== 0) bits.writeString(game.nameKey ?? "");
  bits.writeBits(1, game.customOnline ? 1 : 0);
};

const readGame = (bits: Bitstream): Game => {
  const id = bits.readU32();
  const nameId = bits.readU32();
  const nameKey = nameId !== 0 ? bits.readString() : undefined;
  const customOnline = bits.readBits(1) !== 0;
  return nameKey === undefined
    ? { id, nameId, customOnline }
    : { id, nameId, nameKey, customOnline };
};

const writeHero = (bits: Bitstream, hero: Hero | undefined): void => {
  bits.writeU32(hero?.heroId ?? 0);
  bits.writeU32(hero?.costumeId ?? 0);
  bits.writeU32(hero?.field3172 ?? 0);
  bits.writeU32(hero?.weaponSkinId ?? 0);
};

const writePlayer = (bits: Bitstream, player: Player, heroSlotCount: number): void => {
  const cosmetics = player.cosmetics;
  bits.writeU32(player.entityId);
  bits.writeU32(player.team);
  bits.writeString(player.name);
  bits.writeU32(player.colorSchemeId);
  bits.writeU32(cosmetics.spawnBotId);
  bits.writeU32(cosmetics.companionId);
  bits.writeU32(cosmetics.field2463);
  bits.writeU32(cosmetics.field8849);
  bits.writeU32(cosmetics.field11747);
  for (let i = 0; i < 8; i++) bits.writeU32(cosmetics.tauntIds[i] ?? 0);
  bits.writeU16(cosmetics.field2378);
  bits.writeU16(cosmetics.field15047);
  for (const word of cosmetics.bitfield) {
    bits.writeBits(1, 1);
    bits.writeU32(word);
  }
  bits.writeBits(1, 0);
  bits.writeU16(cosmetics.field4335);
  bits.writeU32(cosmetics.field3535);
  bits.writeU32(cosmetics.field6575);
  for (let i = 0; i < heroSlotCount; i++) writeHero(bits, player.heroes[i]);
  bits.writeBits(1, player.hidden ? 1 : 0);
  const handicap = player.handicap;
  bits.writeBits(1, handicap === undefined ? 0 : 1);
  if (handicap !== undefined) {
    bits.writeU32(handicap.lives);
    bits.writeU32(handicap.statA);
    bits.writeU32(handicap.statB);
  }
};

const readPlayer = (bits: Bitstream, heroSlotCount: number): Player => {
  const entityId = bits.readU32();
  const team = bits.readU32();
  const name = bits.readString();
  const colorSchemeId = bits.readU32();
  const spawnBotId = bits.readU32();
  const companionId = bits.readU32();
  const field2463 = bits.readU32();
  const field8849 = bits.readU32();
  const field11747 = bits.readU32();
  const tauntIds: TauntIds = [
    bits.readU32(),
    bits.readU32(),
    bits.readU32(),
    bits.readU32(),
    bits.readU32(),
    bits.readU32(),
    bits.readU32(),
    bits.readU32(),
  ];
  const field2378 = bits.readU16();
  const field15047 = bits.readU16();
  const bitfield: number[] = [];
  while (bits.readBits(1) !== 0) bitfield.push(bits.readU32());
  const field4335 = bits.readU16();
  const field3535 = bits.readU32();
  const field6575 = bits.readU32();
  const heroes: Hero[] = [];
  for (let i = 0; i < heroSlotCount; i++) {
    heroes.push({
      heroId: bits.readU32(),
      costumeId: bits.readU32(),
      field3172: bits.readU32(),
      weaponSkinId: bits.readU32(),
    });
  }
  const hidden = bits.readBits(1) !== 0;
  const handicap =
    bits.readBits(1) !== 0
      ? { lives: bits.readU32(), statA: bits.readU32(), statB: bits.readU32() }
      : undefined;
  const player = {
    entityId,
    team,
    name,
    colorSchemeId,
    heroes,
    cosmetics: {
      spawnBotId,
      companionId,
      field2463,
      field8849,
      field11747,
      tauntIds,
      field2378,
      field15047,
      bitfield,
      field4335,
      field3535,
      field6575,
    },
    hidden,
  };
  return handicap === undefined ? player : { ...player, handicap };
};

const writeSetup = (bits: Bitstream, replay: Replay): void => {
  bits.writeBits(4, 4);
  for (const key of RULE_KEYS) bits.writeU32(replay.rules[key]);
  bits.writeU32(replay.level.id);
  bits.writeU16(replay.heroSlotCount);
  for (const player of replay.players) {
    bits.writeBits(1, 1);
    writePlayer(bits, player, replay.heroSlotCount);
  }
  bits.writeBits(1, 0);
  bits.writeU32(computePlayerChecksum(replay.players, replay.level.id, replay.heroSlotCount));
};

const readRules = (bits: Bitstream): Rules => ({
  flags: bits.readU32(),
  maxPlayers: bits.readU32(),
  duration: bits.readU32(),
  roundDuration: bits.readU32(),
  startingLives: bits.readU32(),
  scoringTypeId: bits.readU32(),
  scoreToWin: bits.readU32(),
  gameSpeed: bits.readU32(),
  damageRatio: bits.readU32(),
  levelSetId: bits.readU32(),
  itemSpawnRuleSetId: bits.readU32(),
  weaponSpawnRateId: bits.readU32(),
  gadgetSpawnRateId: bits.readU32(),
  unknown12964: bits.readU32(),
  variation: bits.readU32(),
});

const writeResults = (bits: Bitstream, results: Results): void => {
  bits.writeBits(4, 6);
  bits.writeU32(results.duration);
  if (results.scores.length === 0) bits.writeBits(1, 0);
  else {
    bits.writeBits(1, 1);
    for (const score of results.scores) {
      bits.writeBits(1, 1);
      bits.writeBits(5, score.entityId);
      bits.writeU16(score.score);
    }
    bits.writeBits(1, 0);
  }
  bits.writeU32(results.endValue);
};

const readResults = (bits: Bitstream): Results => {
  const duration = bits.readU32();
  const scores: Score[] = [];
  if (bits.readBits(1) !== 0) {
    while (bits.readBits(1) !== 0) {
      scores.push({ entityId: bits.readBits(5), score: bits.readU16() });
    }
  }
  const endValue = bits.readU32();
  return { duration, scores, endValue };
};

const writeInputs = (bits: Bitstream, inputs: readonly Input[]): void => {
  bits.writeBits(4, 1);
  const groups = new Map<number, Input[]>();
  for (const input of inputs) {
    const group = groups.get(input.entityId);
    if (group === undefined) groups.set(input.entityId, [input]);
    else group.push(input);
  }
  for (const [entityId, group] of groups) {
    bits.writeBits(1, 1);
    bits.writeBits(5, entityId);
    bits.writeU32(group.length);
    for (const row of group) {
      bits.writeU32(row.time);
      if (row.input === undefined) bits.writeBits(1, 0);
      else {
        bits.writeBits(1, 1);
        bits.writeBits(14, row.input);
      }
    }
  }
  bits.writeBits(1, 0);
};

const readInputs = (bits: Bitstream, inputs: Input[]): void => {
  while (bits.readBits(1) !== 0) {
    const entityId = bits.readBits(5);
    const count = bits.readU32();
    for (let i = 0; i < count; i++) {
      const time = bits.readU32();
      inputs.push(
        bits.readBits(1) !== 0 ? { entityId, time, input: bits.readBits(14) } : { entityId, time },
      );
    }
  }
};

const writeEvents = (bits: Bitstream, type: number, events: readonly EntityEvent[]): void => {
  bits.writeBits(4, type);
  for (const event of events) {
    bits.writeBits(1, 1);
    bits.writeBits(5, event.entityId);
    bits.writeU32(event.time);
  }
  bits.writeBits(1, 0);
};

const readEvents = (bits: Bitstream): EntityEvent[] => {
  const events: EntityEvent[] = [];
  while (bits.readBits(1) !== 0) {
    events.push({ entityId: bits.readBits(5), time: bits.readU32() });
  }
  return events;
};

const encodeSync = (replay: Replay): Uint8Array => {
  for (const player of replay.players) {
    if (player.heroes.length > replay.heroSlotCount) {
      throw new DecodeFailure(
        new InvalidReplay({
          reason: `player has ${player.heroes.length} heroes, but heroSlotCount is ${replay.heroSlotCount}`,
        }),
      );
    }
  }
  const bits = new Bitstream();
  bits.writeU32(replay.replayVersion);
  writeGame(bits, replay.game);
  writeSetup(bits, replay);
  writeResults(bits, replay.results);
  writeInputs(bits, replay.inputs);
  writeEvents(bits, 5, replay.events);
  writeEvents(bits, 7, replay.otherEvents);
  bits.writeBits(4, 2);
  return bits.toUint8Array();
};

/** Reads version then 4-bit chunk types, skipping payloads. Not part of the public API. */
export const chunkTypes = (bytes: Uint8Array): number[] => {
  const bits = new Bitstream(bytes);
  bits.readU32();
  const types: number[] = [];
  while (bits.remainingBits >= 4) {
    const type = bits.readBits(4);
    types.push(type);
    switch (type) {
      case 1:
        readInputs(bits, []);
        break;
      case 2:
        return types;
      case 3:
        readGame(bits);
        break;
      case 4: {
        readRules(bits);
        bits.readU32();
        const slots = bits.readU16();
        while (bits.readBits(1) !== 0) readPlayer(bits, slots);
        bits.readU32();
        break;
      }
      case 5:
      case 7:
        readEvents(bits);
        break;
      case 6:
        readResults(bits);
        break;
      case 8:
      default:
        return types;
    }
  }
  return types;
};

const decodeSync = (bytes: Uint8Array): Replay => {
  const bits = new Bitstream(bytes);
  const replayVersion = bits.readU32();
  let game: Game = { id: 0, nameId: 0, customOnline: false };
  let rules: Rules | undefined;
  let level: Level | undefined;
  let heroSlotCount: number | undefined;
  let players: Player[] | undefined;
  let results: Results = { duration: 0, scores: [], endValue: 0 };
  const inputs: Input[] = [];
  let events: EntityEvent[] = [];
  let otherEvents: EntityEvent[] = [];

  let done = false;
  while (!done && bits.remainingBits >= 4) {
    const type = bits.readBits(4);
    switch (type) {
      case 1:
        readInputs(bits, inputs);
        break;
      case 2:
        done = true;
        break;
      case 3:
        game = readGame(bits);
        break;
      case 4: {
        rules = readRules(bits);
        const levelId = bits.readU32();
        const slots = bits.readU16();
        if (slots > MAX_HERO_SLOTS) {
          throw new DecodeFailure(
            new InvalidReplay({
              reason: `replay declares ${slots} hero slots, at most 5 are valid`,
            }),
          );
        }
        const read: Player[] = [];
        while (bits.readBits(1) !== 0) read.push(readPlayer(bits, slots));
        const expected = bits.readU32();
        const actual = computePlayerChecksum(read, levelId, slots);
        if (expected !== actual)
          throw new DecodeFailure(new ChecksumMismatch({ expected, actual }));
        level = { id: levelId };
        heroSlotCount = slots;
        players = read;
        break;
      }
      case 5:
        events = readEvents(bits);
        break;
      case 6:
        results = readResults(bits);
        break;
      case 7:
        otherEvents = readEvents(bits);
        break;
      case 8:
        throw new DecodeFailure(
          new InvalidReplay({ reason: "replay is marked corrupt (chunk 8)" }),
        );
      default:
        done = true;
    }
  }

  if (rules === undefined || level === undefined || heroSlotCount === undefined) {
    throw new DecodeFailure(new InvalidReplay({ reason: "replay has no match setup chunk" }));
  }
  if (players === undefined || players.length === 0) {
    throw new DecodeFailure(new InvalidReplay({ reason: "replay has no players" }));
  }

  return {
    replayVersion,
    game,
    rules,
    level,
    heroSlotCount,
    players,
    results,
    inputs,
    events,
    otherEvents,
  };
};

export class ReplayCodec extends Context.Service<
  ReplayCodec,
  {
    readonly decode: (bytes: Uint8Array) => Effect.Effect<Replay, InvalidReplay | ChecksumMismatch>;
    readonly encode: (replay: Replay) => Effect.Effect<Uint8Array, InvalidReplay>;
  }
>()("@gimped/replay/ReplayCodec") {
  static readonly layer: Layer.Layer<ReplayCodec> = Layer.sync(ReplayCodec, () => {
    const decode = Effect.fn("ReplayCodec.decode")(function* (bytes: Uint8Array) {
      return yield* Effect.try({
        try: () => decodeSync(bytes),
        catch: (cause) => {
          if (cause instanceof DecodeFailure) return cause.failure;
          if (cause instanceof RangeError) return new InvalidReplay({ reason: "truncated" });
          return new InvalidReplay({
            reason: cause instanceof Error ? cause.message : "decode failed",
          });
        },
      });
    });

    const encode = Effect.fn("ReplayCodec.encode")(function* (replay: Replay) {
      return yield* Effect.try({
        try: () => encodeSync(replay),
        catch: (cause) => {
          if (cause instanceof DecodeFailure) return cause.failure;
          return new InvalidReplay({
            reason: cause instanceof Error ? cause.message : "encode failed",
          });
        },
      });
    });

    return { decode, encode };
  });

  static readonly Default = this.layer;
}

export const decode = Effect.fn("decode")(function* (bytes: Uint8Array) {
  const codec = yield* ReplayCodec;
  return yield* codec.decode(bytes);
});

export const encode = Effect.fn("encode")(function* (replay: Replay) {
  const codec = yield* ReplayCodec;
  return yield* codec.encode(replay);
});
