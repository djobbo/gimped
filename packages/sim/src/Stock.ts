import { Context, Effect, Layer } from "effect";
import { SimulationFault } from "./errors.ts";
import { Match } from "./Match.ts";
import { World } from "./World.ts";

export class Stock extends Context.Service<
  Stock,
  {
    readonly step: () => Effect.Effect<void, SimulationFault>;
  }
>()("@gimped/sim/Stock") {
  static readonly layer = Layer.effect(
    Stock,
    Effect.gen(function* () {
      const match = yield* Match;
      const world = yield* World;

      const step = Effect.fn("Stock.step")(function* () {
        const state = yield* match.get();

        for (const fighter of state.fighters) {
          if (fighter.ko) {
            continue;
          }

          const inZone = yield* world.inBlastzone(fighter.x, fighter.y);
          if (!inZone) {
            continue;
          }

          fighter.lives -= 1;

          if (fighter.lastHitBy !== undefined) {
            const scorer = state.fighters.find((f) => f.entityId === fighter.lastHitBy);
            if (scorer !== undefined) {
              scorer.score += 1;
            }
          }

          if (fighter.lives > 0) {
            const teamIndex = state.fighters
              .filter((f) => f.team === fighter.team)
              .indexOf(fighter);
            const spawn = yield* world.spawnFor(fighter.team, teamIndex);
            fighter.x = spawn.x;
            fighter.y = spawn.y;
            fighter.vx = 0;
            fighter.vy = 0;
            fighter.ko = false;
            fighter.damage = 0;
          } else {
            fighter.ko = true;
          }
        }

        const teams = new Set(state.fighters.map((f) => f.team));
        for (const team of teams) {
          const members = state.fighters.filter((f) => f.team === team);
          if (members.length > 0 && members.every((f) => f.lives === 0)) {
            state.ended = true;
            break;
          }
        }
      });

      return Stock.of({ step });
    }),
  );
}
