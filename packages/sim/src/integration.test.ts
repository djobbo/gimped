import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Envelope, ReplayCodec } from "@gimped/replay";
import { Effect, Layer } from "effect";
import { InputBits } from "./domain.ts";
import { GameData } from "./GameData.ts";
import {
  create,
  replay1v1,
  replay2v2,
  runReplay,
  Simulation,
  snapshot,
  step,
  TestLive,
} from "./index.ts";
import { LevelCollision } from "./LevelCollision.ts";
import { Match } from "./Match.ts";
import { ReplayLoader } from "./ReplayLoader.ts";
import { Tables } from "./Tables.ts";

layer(TestLive)("integration", (it) => {
  it.effect("1v1 credited KO ends the match with fighter 2 score 1", () =>
    Effect.gen(function* () {
      yield* create(replay1v1());
      const match = yield* Match;
      yield* match.modify((s) => {
        const fighter = s.fighters.find((f) => f.entityId === 1);
        if (fighter === undefined) {
          return;
        }
        fighter.x = 500;
        fighter.y = 0;
        fighter.lastHitBy = 2;
        fighter.lives = 1;
      });
      yield* step();
      const snap = yield* snapshot();
      expect(snap.ended).toBe(true);
      const scorer = snap.fighters.find((f) => f.entityId === 2);
      expect(scorer?.score).toBe(1);
    }),
  );

  it.effect("2v2 ends when both team-1 fighters are KO'd", () =>
    Effect.gen(function* () {
      yield* create(replay2v2());
      const match = yield* Match;
      yield* match.modify((s) => {
        for (const fighter of s.fighters) {
          if (fighter.team !== 1) {
            continue;
          }
          fighter.x = 500;
          fighter.y = 0;
          fighter.lives = 1;
        }
      });
      yield* step();
      const snap = yield* snapshot();
      expect(snap.ended).toBe(true);
    }),
  );

  it.effect("runReplay walk-off succeeds with scores length 2 and duration multiple of 16", () =>
    Effect.gen(function* () {
      const base = replay1v1();
      const results = yield* runReplay({
        ...base,
        rules: { ...base.rules, startingLives: 1 },
        inputs: [{ entityId: 1, time: 16, input: InputBits.right }],
      });
      expect(results.scores.length).toBe(2);
      expect(results.duration % 16).toBe(0);
    }),
  );
});

const replayPath = process.env.GIMPED_UNARMED_REPLAY;
const dataPath = process.env.GIMPED_SWZ ?? process.env.GIMPED_GAME_DATA;
const skipGolden =
  replayPath === undefined || replayPath === "" || dataPath === undefined || dataPath === "";

const GoldenLive = ReplayLoader.layer.pipe(
  Layer.provideMerge(GameData.layer),
  Layer.provideMerge(Envelope.layer),
  Layer.provideMerge(ReplayCodec.layer),
  Layer.provideMerge(NodeServices.layer),
);

layer(GoldenLive)("optional unarmed golden", (it) => {
  it.effect.skipIf(skipGolden)("runReplay matches recorded duration and scores", () =>
    Effect.gen(function* () {
      if (
        replayPath === undefined ||
        replayPath === "" ||
        dataPath === undefined ||
        dataPath === ""
      ) {
        return;
      }
      const loader = yield* ReplayLoader;
      const gameData = yield* GameData;
      const replay = yield* loader.fromPath(replayPath);
      const loaded = yield* gameData.load(dataPath, replay.level.id);
      const results = yield* runReplay(replay).pipe(
        Effect.provide(
          Simulation.Default.pipe(
            Layer.provide(Tables.make(loaded.tables)),
            Layer.provide(LevelCollision.make(loaded.level)),
          ),
        ),
      );
      expect(results.duration).toBe(replay.results.duration);
      expect(results.scores).toEqual(replay.results.scores);
    }),
  );
});
