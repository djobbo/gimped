import { MalformedJson, runWith } from "@gimped/common";
import { Effect, FileSystem, Path, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { TestLive } from "./layers.ts";
import { compileFile, decompileFile } from "./pipeline.ts";
import { ReplayJsonText, type Replay } from "./ReplayJson.ts";

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

const withHeroName = (replay: Replay, heroName: string): Replay => ({
  ...replay,
  players: replay.players.map((player) => ({
    ...player,
    heroes: player.heroes.map((hero) => ({ ...hero, heroName })),
  })),
});

const run = runWith(TestLive);

describe("file pipeline", () => {
  it("round-trips a minimal replay without names", async () => {
    const { first, second } = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectory({ prefix: "replay-pipeline-" });
        const jsonIn = path.join(root, "in.json");
        const replayPath = path.join(root, "match.replay");
        const jsonOut = path.join(root, "out.json");

        yield* fs.writeFileString(
          jsonIn,
          `${yield* Schema.encodeUnknownEffect(ReplayJsonText)(minimal())}\n`,
        );
        yield* compileFile({ inPath: jsonIn, outPath: replayPath });
        yield* decompileFile({ inPath: replayPath, outPath: jsonOut });

        const firstText = yield* fs.readFileString(jsonIn);
        const secondText = yield* fs.readFileString(jsonOut);
        const first = yield* Schema.decodeUnknownEffect(ReplayJsonText)(firstText);
        const second = yield* Schema.decodeUnknownEffect(ReplayJsonText)(secondText);
        return { first, second };
      }),
    );

    expect(second).toEqual(first);
    expect(second.players[0]?.heroes[0]?.heroName).toBeUndefined();
  });

  it("drops heroName when decompiling without --data", async () => {
    const decoded = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectory({ prefix: "replay-pipeline-" });
        const jsonIn = path.join(root, "in.json");
        const replayPath = path.join(root, "match.replay");
        const jsonOut = path.join(root, "out.json");

        yield* fs.writeFileString(
          jsonIn,
          `${yield* Schema.encodeUnknownEffect(ReplayJsonText)(withHeroName(minimal(), "Bodvar"))}\n`,
        );
        yield* compileFile({ inPath: jsonIn, outPath: replayPath });
        yield* decompileFile({ inPath: replayPath, outPath: jsonOut });

        const text = yield* fs.readFileString(jsonOut);
        return yield* Schema.decodeUnknownEffect(ReplayJsonText)(text);
      }),
    );

    expect(decoded.players[0]?.heroes[0]?.heroName).toBeUndefined();
  });

  it("fails compile on invalid JSON", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectory({ prefix: "replay-pipeline-" });
        const jsonIn = path.join(root, "in.json");
        const replayPath = path.join(root, "match.replay");

        yield* fs.writeFileString(jsonIn, "{not json");
        return yield* Effect.result(compileFile({ inPath: jsonIn, outPath: replayPath }));
      }),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(MalformedJson);
  });
});
