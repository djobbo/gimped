import { runWith } from "@gimped/common";
import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Layer, Path } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { GameDataError } from "./errors.ts";
import { GameData } from "./GameData.ts";
import type { Replay } from "./ReplayJson.ts";

const heroTypesXml = `<HeroTypes>
  <Hero HeroName="Bodvar"><HeroID>3</HeroID></Hero>
</HeroTypes>`;

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

const withHeroId = (replay: Replay, heroId: number): Replay => ({
  ...replay,
  players: replay.players.map((player) => ({
    ...player,
    heroes: player.heroes.map((hero) => ({ ...hero, heroId })),
  })),
});

const live = GameData.layer.pipe(Layer.provideMerge(NodeServices.layer));
const runNone = runWith(GameData.none);
const runLive = runWith(live);

const writeHeroTypes = Effect.fn("writeHeroTypes")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectory({ prefix: "gamedata-" });
  yield* fs.writeFileString(path.join(dir, "HeroTypes.xml"), heroTypesXml);
  return dir;
});

describe("GameData", () => {
  it("none does not add heroName", async () => {
    const replay = minimal();
    const annotated = await runNone(
      Effect.gen(function* () {
        const data = yield* GameData;
        return yield* data.annotate(replay, "/unused");
      }),
    );
    expect(annotated.players[0]?.heroes[0]?.heroName).toBeUndefined();
  });

  it("annotates heroName from HeroTypes.xml", async () => {
    const replay = minimal();
    const annotated = await runLive(
      Effect.gen(function* () {
        const dir = yield* writeHeroTypes();
        const data = yield* GameData;
        return yield* data.annotate(replay, dir);
      }),
    );
    expect(replay.players[0]?.heroes[0]?.heroName).toBeUndefined();
    expect(annotated.players[0]?.heroes[0]?.heroName).toBe("Bodvar");
  });

  it("leaves unknown hero ids unnamed", async () => {
    const annotated = await runLive(
      Effect.gen(function* () {
        const dir = yield* writeHeroTypes();
        const data = yield* GameData;
        return yield* data.annotate(withHeroId(minimal(), 99), dir);
      }),
    );
    expect(annotated.players[0]?.heroes[0]?.heroName).toBeUndefined();
  });

  it("fails with GameDataError when the path is missing", async () => {
    const result = await runLive(
      Effect.gen(function* () {
        const data = yield* GameData;
        return yield* Effect.result(data.annotate(minimal(), "/this/path/does/not/exist"));
      }),
    );
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(GameDataError);
  });
});
