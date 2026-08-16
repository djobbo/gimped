import type { Replay } from "@gimped/replay";
import type { ItemRow, LevelCollisionData, PowerRow, TablesData } from "./domain.ts";

type Cosmetics = Replay["players"][number]["cosmetics"];

/** Dump Unarmed `itemTypes.csv` slots 1–11 (spec kit table). */
const unarmedSlots = (): Map<number, string> =>
  new Map([
    [1, "BaseNeutral"],
    [2, "BaseSide"],
    [3, "BaseDown"],
    [4, "BaseAir"],
    [5, "BaseAirSide"],
    [6, "BaseAirDown"],
    [7, "BaseSmashSide"],
    [8, "BaseSmashDown"],
    [9, "BaseAirUpHeavy"],
    [10, "BaseGroundPound"],
    [11, "BaseSmashUp"],
  ]);

/** Minimal PowerRows; BaseNeutral keeps dump nlight combat numbers for Combat tests. */
const kitPowers = (): Map<string, PowerRow> => {
  const baseNeutral: PowerRow = {
    id: 1,
    name: "BaseNeutral",
    startup: 5,
    active: 2,
    recover: 3,
    damage: 3,
    fixedImpulse: 25,
    stun: 17,
    centerOffsetX: 76,
    centerOffsetY: 4,
    aoeX: 45,
    aoeY: 33,
    impulseOffsetX: 100,
    impulseOffsetY: -48,
  };
  const named = (id: number, name: string): PowerRow => ({ id, name });
  return new Map([
    ["BaseNeutral", baseNeutral],
    ["BaseSide", named(2, "BaseSide")],
    ["BaseDown", named(3, "BaseDown")],
    ["BaseAir", named(4, "BaseAir")],
    ["BaseAirSide", named(5, "BaseAirSide")],
    ["BaseAirDown", named(6, "BaseAirDown")],
    ["BaseSmashSide", named(7, "BaseSmashSide")],
    ["BaseSmashDown", named(8, "BaseSmashDown")],
    ["BaseAirUpHeavy", named(9, "BaseAirUpHeavy")],
    ["BaseGroundPound", named(10, "BaseGroundPound")],
    ["BaseSmashUp", named(11, "BaseSmashUp")],
  ]);
};

export const stockTables = (): TablesData => {
  const powersByName = kitPowers();
  const unarmed: ItemRow = { name: "Unarmed", slots: unarmedSlots() };
  return {
    scoring: new Map([[1, { id: 1, name: "Stock" }]]),
    heroes: new Map([[3, { id: 3, name: "Bodvar" }]]),
    hurtboxes: new Map([["DEFAULT", { name: "DEFAULT", width: 50, height: 80 }]]),
    powers: new Map([...powersByName.values()].map((row) => [row.id, row])),
    powersByName,
    items: new Map([["Unarmed", unarmed]]),
    levels: new Map([[12, { id: 12, name: "Box" }]]),
    stats: new Map(),
  };
};

export const boxStage = (): LevelCollisionData => ({
  levelId: 12,
  lines: [{ startX: -200, startY: 0, endX: 200, endY: 0, type: 1 }],
  spawns: [
    { x: -80, y: -50, team: 1 },
    { x: 80, y: -50, team: 2 },
    { x: -40, y: -50, team: 1 },
    { x: 40, y: -50, team: 2 },
  ],
  bounds: { x: -400, y: -200, w: 800, h: 600 },
});

export const cosmetics = (): Cosmetics => ({
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
});

export const player = (
  entityId: number,
  team: number,
  name: string,
): Replay["players"][number] => ({
  entityId,
  team,
  name,
  colorSchemeId: 0,
  heroes: [{ heroId: 3, costumeId: 0, field3172: 0, weaponSkinId: 0 }],
  cosmetics: cosmetics(),
  hidden: false,
});

const rules = () => ({
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
});

export const replay1v1 = (): Replay => ({
  replayVersion: 268,
  game: { id: 1, nameId: 0, customOnline: false },
  rules: rules(),
  level: { id: 12 },
  heroSlotCount: 1,
  players: [player(1, 1, "A"), player(2, 2, "B")],
  results: { duration: 0, scores: [], endValue: 1 },
  inputs: [],
  events: [],
  otherEvents: [],
});

export const replay2v2 = (): Replay => ({
  ...replay1v1(),
  players: [player(1, 1, "A"), player(2, 1, "B"), player(3, 2, "C"), player(4, 2, "D")],
});
