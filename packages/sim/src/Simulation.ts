import type { Replay } from "@gimped/replay";
import { Well512 } from "@gimped/swz";
import { Context, Effect, Layer } from "effect";
import { Clock } from "./Clock.ts";
import { Collision } from "./Collision.ts";
import { Combat } from "./Combat.ts";
import type { FighterState, SimResults, Snapshot } from "./domain.ts";
import { MissingCollision, MissingTables, SimulationFault, UnsupportedMatch } from "./errors.ts";
import { Fighter } from "./Fighter.ts";
import { Input } from "./Input.ts";
import { Items } from "./Items.ts";
import { LevelCollision } from "./LevelCollision.ts";
import { Match } from "./Match.ts";
import { MatchRules } from "./MatchRules.ts";
import { Renderer } from "./Renderer.ts";
import { Rng } from "./Rng.ts";
import { Stock } from "./Stock.ts";
import { Tables } from "./Tables.ts";
import { World } from "./World.ts";

const HURT_W = 50;
const HURT_H = 80;
const TIME_CAP_MS = 600_000;

export class Simulation extends Context.Service<
  Simulation,
  {
    readonly create: (
      replay: Replay,
    ) => Effect.Effect<void, UnsupportedMatch | MissingTables | MissingCollision | SimulationFault>;
    readonly step: () => Effect.Effect<void, SimulationFault>;
    readonly runToEnd: () => Effect.Effect<SimResults, SimulationFault>;
    readonly runReplay: (
      replay: Replay,
    ) => Effect.Effect<
      SimResults,
      UnsupportedMatch | MissingTables | MissingCollision | SimulationFault
    >;
    readonly snapshot: () => Effect.Effect<Snapshot, SimulationFault>;
  }
>()("@gimped/sim/Simulation") {
  static readonly layer = Layer.effect(
    Simulation,
    Effect.gen(function* () {
      const match = yield* Match;
      const clock = yield* Clock;
      const input = yield* Input;
      const items = yield* Items;
      const world = yield* World;
      const fighter = yield* Fighter;
      const combat = yield* Combat;
      const stock = yield* Stock;
      const renderer = yield* Renderer;
      const matchRules = yield* MatchRules;
      const tables = yield* Tables;
      const level = yield* LevelCollision;
      const rng = yield* Rng;

      const create = Effect.fn("Simulation.create")(function* (replay: Replay) {
        yield* matchRules.check(replay);

        if (level.levelId !== replay.level.id) {
          return yield* Effect.fail(new MissingCollision({ levelId: replay.level.id }));
        }

        for (const player of replay.players) {
          const heroId = player.heroes[0]?.heroId;
          if (heroId === undefined || !tables.heroes.has(heroId)) {
            return yield* Effect.fail(new MissingTables({ reason: `hero ${heroId ?? "missing"}` }));
          }
        }

        yield* rng.initState(0);

        yield* match.replace({
          timeMs: 0,
          gameSpeed: replay.rules.gameSpeed,
          ended: false,
          fighters: [],
          lines: level.lines,
          spawns: level.spawns,
          bounds: level.bounds,
          startingLives: replay.rules.startingLives,
          inputs: [],
        });

        const teamIndex = new Map<number, number>();
        const fighters: FighterState[] = [];
        for (const player of replay.players) {
          const index = teamIndex.get(player.team) ?? 0;
          teamIndex.set(player.team, index + 1);
          const spawn = yield* world.spawnFor(player.team, index);
          fighters.push({
            entityId: player.entityId,
            team: player.team,
            x: spawn.x,
            y: spawn.y,
            vx: 0,
            vy: 0,
            grounded: false,
            facingLeft: false,
            lives: replay.rules.startingLives,
            damage: 0,
            score: 0,
            input: undefined,
            hurtW: HURT_W,
            hurtH: HURT_H,
            stun: 0,
            ko: false,
            lastHitBy: undefined,
          });
        }

        yield* match.modify((s) => {
          s.fighters = fighters;
        });
        yield* input.load(replay.inputs);
      });

      const step = Effect.fn("Simulation.step")(function* () {
        yield* clock.advance();
        yield* input.apply();
        yield* items.step();
        yield* world.step();
        yield* fighter.step();
        yield* combat.step();
        yield* stock.step();
        const snap = yield* match.snapshot();
        yield* renderer.present(snap);
      });

      const runToEnd = Effect.fn("Simulation.runToEnd")(function* () {
        while (true) {
          const state = yield* match.get();
          if (state.ended) {
            break;
          }
          if (state.timeMs >= TIME_CAP_MS) {
            return yield* Effect.fail(new SimulationFault({ reason: "time cap" }));
          }
          yield* step();
        }
        const snap = yield* match.snapshot();
        return {
          duration: snap.timeMs,
          scores: snap.fighters.map((f) => ({ entityId: f.entityId, score: f.score })),
          endValue: 1 as const,
        };
      });

      const runReplay = Effect.fn("Simulation.runReplay")(function* (replay: Replay) {
        yield* create(replay);
        return yield* runToEnd();
      });

      const snapshot = Effect.fn("Simulation.snapshot")(function* () {
        return yield* match.snapshot();
      });

      return Simulation.of({ create, step, runToEnd, runReplay, snapshot });
    }),
  );

  static readonly Default = this.layer.pipe(
    Layer.provideMerge(Clock.layer),
    Layer.provideMerge(Input.layer),
    Layer.provideMerge(Items.layer),
    Layer.provideMerge(Renderer.layer),
    Layer.provideMerge(MatchRules.layer),
    Layer.provideMerge(Combat.layer),
    Layer.provideMerge(Stock.layer),
    Layer.provideMerge(Fighter.layer),
    Layer.provideMerge(World.layer),
    Layer.provideMerge(Collision.layer),
    Layer.provideMerge(Match.layer),
    Layer.provideMerge(Rng.layer.pipe(Layer.provide(Well512.layer))),
  );
}

export const create = Effect.fn("create")(function* (replay: Replay) {
  const simulation = yield* Simulation;
  return yield* simulation.create(replay);
});

export const step = Effect.fn("step")(function* () {
  const simulation = yield* Simulation;
  return yield* simulation.step();
});

export const runToEnd = Effect.fn("runToEnd")(function* () {
  const simulation = yield* Simulation;
  return yield* simulation.runToEnd();
});

export const runReplay = Effect.fn("runReplay")(function* (replay: Replay) {
  const simulation = yield* Simulation;
  return yield* simulation.runReplay(replay);
});

export const snapshot = Effect.fn("snapshot")(function* () {
  const simulation = yield* Simulation;
  return yield* simulation.snapshot();
});
