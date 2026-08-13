import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { layer as replayLayer, ReplayJsonText } from "@gimped/replay";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { Command } from "effect/unstable/cli";
import { root } from "./cli.ts";

const AppLive = replayLayer.pipe(Layer.provideMerge(NodeServices.layer));
const runCli = (args: ReadonlyArray<string>) => Command.runWith(root, { version: "0.0.0" })(args);

const minimal = () => ({
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

layer(AppLive)("replay CLI", (it) => {
  it("exposes decompile and compile subcommands", () => {
    expect(
      root.subcommands.flatMap((group) => group.commands.map((command) => command.name)),
    ).toEqual(["decompile", "compile"]);
  });

  it.effect("round-trips JSON through compile then decompile without names", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const temp = yield* fs.makeTempDirectory({ prefix: "replay-cli-" });
      const jsonIn = path.join(temp, "in.json");
      const replayPath = path.join(temp, "match.replay");
      const jsonOut = path.join(temp, "out.json");

      yield* fs.writeFileString(jsonIn, `${Schema.encodeUnknownSync(ReplayJsonText)(minimal())}\n`);
      yield* runCli(["compile", "--in", jsonIn, "--out", replayPath]);
      yield* runCli(["decompile", "--in", replayPath, "--out", jsonOut]);

      const firstText = yield* fs.readFileString(jsonIn);
      const secondText = yield* fs.readFileString(jsonOut);
      const first = yield* Schema.decodeUnknownEffect(ReplayJsonText)(firstText);
      const second = yield* Schema.decodeUnknownEffect(ReplayJsonText)(secondText);
      expect(second).toEqual(first);
      expect(second.players[0]?.heroes[0]?.heroName).toBeUndefined();
    }),
  );
});
