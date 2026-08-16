import { Context, Effect, Layer } from "effect";
import type { Spawn } from "./domain.ts";
import { SimulationFault } from "./errors.ts";
import { Collision } from "./Collision.ts";
import { Match } from "./Match.ts";

const noSpawn = (team: number, index: number) =>
  Effect.fail(new SimulationFault({ reason: `no spawn for team ${team} index ${index}` }));

export class World extends Context.Service<
  World,
  {
    readonly spawnFor: (team: number, index: number) => Effect.Effect<Spawn, SimulationFault>;
    readonly inBlastzone: (x: number, y: number) => Effect.Effect<boolean, SimulationFault>;
    readonly step: () => Effect.Effect<void, SimulationFault>;
  }
>()("@gimped/sim/World") {
  static readonly layer = Layer.effect(
    World,
    Effect.gen(function* () {
      const match = yield* Match;
      yield* Collision;

      const spawnFor = Effect.fn("World.spawnFor")(function* (team: number, index: number) {
        const state = yield* match.get();
        const byTeam = state.spawns.filter((s) => s.team === team);
        const spawn = byTeam.length > 0 ? byTeam[index] : state.spawns[index];
        if (spawn === undefined) {
          return yield* noSpawn(team, index);
        }
        return spawn;
      });

      const inBlastzone = Effect.fn("World.inBlastzone")(function* (x: number, y: number) {
        const state = yield* match.get();
        const { x: bx, y: by, w, h } = state.bounds;
        return x < bx || y < by || x > bx + w || y > by + h;
      });

      const step = Effect.fn("World.step")(function* () {
        // v1: no moving platforms in LevelCollisionData
      });

      return World.of({ spawnFor, inBlastzone, step });
    }),
  );
}
