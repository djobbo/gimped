import { Schema } from "effect";

const bits5 = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 31 }));
const bits14 = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 16383 }));
const u16 = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 65535 }));
const heroSlots = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 }));

export const Game = Schema.Struct({
  id: Schema.Number,
  nameId: Schema.Number,
  nameKey: Schema.optionalKey(Schema.String),
  customOnline: Schema.Boolean,
});

export const Rules = Schema.Struct({
  flags: Schema.Number,
  maxPlayers: Schema.Number,
  duration: Schema.Number,
  roundDuration: Schema.Number,
  startingLives: Schema.Number,
  scoringTypeId: Schema.Number,
  scoringTypeName: Schema.optionalKey(Schema.String),
  scoreToWin: Schema.Number,
  gameSpeed: Schema.Number,
  damageRatio: Schema.Number,
  levelSetId: Schema.Number,
  itemSpawnRuleSetId: Schema.Number,
  weaponSpawnRateId: Schema.Number,
  gadgetSpawnRateId: Schema.Number,
  unknown12964: Schema.Number,
  variation: Schema.Number,
});

export const Level = Schema.Struct({
  id: Schema.Number,
  name: Schema.optionalKey(Schema.String),
});

export const Hero = Schema.Struct({
  heroId: Schema.Number,
  heroName: Schema.optionalKey(Schema.String),
  costumeId: Schema.Number,
  costumeName: Schema.optionalKey(Schema.String),
  field3172: Schema.Number,
  weaponSkinId: Schema.Number,
});

export const Cosmetics = Schema.Struct({
  spawnBotId: Schema.Number,
  companionId: Schema.Number,
  field2463: Schema.Number,
  field8849: Schema.Number,
  field11747: Schema.Number,
  tauntIds: Schema.Tuple([
    Schema.Number,
    Schema.Number,
    Schema.Number,
    Schema.Number,
    Schema.Number,
    Schema.Number,
    Schema.Number,
    Schema.Number,
  ]),
  field2378: u16,
  field15047: u16,
  bitfield: Schema.Array(Schema.Number),
  field4335: u16,
  field3535: Schema.Number,
  field6575: Schema.Number,
});

export const Handicap = Schema.Struct({
  lives: Schema.Number,
  statA: Schema.Number,
  statB: Schema.Number,
});

export const Player = Schema.Struct({
  entityId: Schema.Number,
  team: Schema.Number,
  name: Schema.String,
  colorSchemeId: Schema.Number,
  colorSchemeName: Schema.optionalKey(Schema.String),
  heroes: Schema.Array(Hero),
  cosmetics: Cosmetics,
  hidden: Schema.Boolean,
  handicap: Schema.optionalKey(Handicap),
});

export const Score = Schema.Struct({
  entityId: bits5,
  score: u16,
});

export const Input = Schema.Struct({
  entityId: bits5,
  time: Schema.Number,
  input: Schema.optionalKey(bits14),
});

export const EntityEvent = Schema.Struct({
  entityId: bits5,
  time: Schema.Number,
});

export const Results = Schema.Struct({
  duration: Schema.Number,
  scores: Schema.Array(Score),
  endValue: Schema.Number,
});

export const ReplayJson = Schema.Struct({
  replayVersion: Schema.Number,
  game: Game,
  rules: Rules,
  level: Level,
  heroSlotCount: heroSlots,
  players: Schema.Array(Player),
  results: Results,
  inputs: Schema.Array(Input),
  events: Schema.Array(EntityEvent),
  otherEvents: Schema.Array(EntityEvent),
});

export const ReplayJsonText = Schema.fromJsonString(ReplayJson, { space: 2 });

export type Replay = typeof ReplayJson.Type;
