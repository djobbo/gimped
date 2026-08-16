import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Envelope, ReplayCodec } from "@gimped/replay";
import { Effect, Layer, Path } from "effect";
import { GameData } from "./GameData.ts";
import { LevelCollision } from "./LevelCollision.ts";
import { Match } from "./Match.ts";
import { ReplayLoader } from "./ReplayLoader.ts";
import { create, runReplay, snapshot, Simulation } from "./Simulation.ts";
import { Tables } from "./Tables.ts";

const FIXTURE = "[10.09] SmallBrawlhaven (4).replay";

const Live = ReplayLoader.layer.pipe(
  Layer.provideMerge(GameData.layer),
  Layer.provideMerge(Envelope.layer),
  Layer.provideMerge(ReplayCodec.layer),
  Layer.provideMerge(NodeServices.layer),
);

const applied = (
  tables: {
    heroes: Map<number, { strength?: number; dexterity?: number; weight?: number; speed?: number }>;
    stats: Map<
      string,
      { runSpeed?: number; impulseMult?: number; recoverMod?: number; recovery?: number }
    >;
  },
  heroId: number,
) => {
  const hero = tables.heroes.get(heroId);
  return {
    runSpeed: tables.stats.get(`Speed${hero?.speed}`)?.runSpeed,
    impulseMult: tables.stats.get(`Strength${hero?.strength}`)?.impulseMult,
    recoverMod: tables.stats.get(`Dexterity${hero?.dexterity}`)?.recoverMod,
    recovery: tables.stats.get(`Weight${hero?.weight}`)?.recovery,
  };
};

layer(Live)("SmallBrawlhaven unarmed stock fixture", (it) => {
  it.effect("loads STOCK 1v1 unarmed legends with distinct applied stats", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const here = yield* path.fromFileUrl(new URL(import.meta.url));
      const replayPath = path.join(path.dirname(here), "..", "fixtures", FIXTURE);
      const swzDir = path.join(path.dirname(here), "..", "..", "swz", "fixtures");

      const loader = yield* ReplayLoader;
      const gameData = yield* GameData;
      const replay = yield* loader.fromPath(replayPath);

      expect(replay.heroSlotCount).toBe(1);
      expect(replay.players.length).toBe(2);
      expect(replay.rules.weaponSpawnRateId).toBe(0);
      expect(replay.rules.gadgetSpawnRateId).toBe(0);

      const loaded = yield* gameData.load(swzDir, replay.level.id);
      expect(loaded.tables.scoring.get(replay.rules.scoringTypeId)?.name.toLowerCase()).toBe(
        "stock",
      );

      const heroA = replay.players[0]?.heroes[0]?.heroId;
      const heroB = replay.players[1]?.heroes[0]?.heroId;
      expect(heroA).toBeDefined();
      expect(heroB).toBeDefined();
      expect(heroA).not.toBe(heroB);

      const statsA = applied(loaded.tables, heroA ?? 0);
      const statsB = applied(loaded.tables, heroB ?? 0);
      expect(statsA.impulseMult).toBeDefined();
      expect(statsB.impulseMult).toBeDefined();
      expect(statsA.impulseMult).not.toBe(statsB.impulseMult);
      expect(statsA.recoverMod).not.toBe(statsB.recoverMod);
      expect(statsA.runSpeed).toBeDefined();
      expect(statsA.recovery).toBeDefined();

      const snap = yield* Effect.gen(function* () {
        yield* create(replay);
        const match = yield* Match;
        return yield* match.get();
      }).pipe(
        Effect.provide(
          Simulation.Default.pipe(
            Layer.provide(Tables.make(loaded.tables)),
            Layer.provide(LevelCollision.make(loaded.level)),
          ),
        ),
      );

      const fighterA = snap.fighters.find((f) => f.entityId === replay.players[0]?.entityId);
      const fighterB = snap.fighters.find((f) => f.entityId === replay.players[1]?.entityId);
      expect(fighterA?.heroId).toBe(heroA);
      expect(fighterB?.heroId).toBe(heroB);
      expect(fighterA?.impulseMult).toBe(statsA.impulseMult);
      expect(fighterB?.impulseMult).toBe(statsB.impulseMult);
      expect(fighterA?.recoverMod).toBe(statsA.recoverMod);
      expect(fighterB?.recoverMod).toBe(statsB.recoverMod);
      expect(fighterA?.runSpeed).toBe(statsA.runSpeed);
      expect(fighterB?.runSpeed).toBe(statsB.runSpeed);
      expect(fighterA?.recovery).toBe(statsA.recovery);
      expect(fighterB?.recovery).toBe(statsB.recovery);
      expect(fighterA?.x).not.toBe(fighterB?.x);
    }),
  );

  it.effect("runToEnd reaches a legal STOCK end", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const here = yield* path.fromFileUrl(new URL(import.meta.url));
      const replayPath = path.join(path.dirname(here), "..", "fixtures", FIXTURE);
      const swzDir = path.join(path.dirname(here), "..", "..", "swz", "fixtures");

      const loader = yield* ReplayLoader;
      const gameData = yield* GameData;
      const replay = yield* loader.fromPath(replayPath);
      const loaded = yield* gameData.load(swzDir, replay.level.id);

      const { results, snap } = yield* Effect.gen(function* () {
        const results = yield* runReplay(replay);
        const snap = yield* snapshot();
        return { results, snap };
      }).pipe(
        Effect.provide(
          Simulation.Default.pipe(
            Layer.provide(Tables.make(loaded.tables)),
            Layer.provide(LevelCollision.make(loaded.level)),
          ),
        ),
      );

      expect(snap.ended).toBe(true);
      expect(results.scores.length).toBe(2);
      expect(snap.fighters.some((f) => f.lives === 0)).toBe(true);
    }),
  );
});
