import { Context, Effect, Layer, Ref } from "effect";
import type { MatchState, Snapshot } from "./domain.ts";
import { SimulationFault } from "./errors.ts";

const noMatch = () => Effect.fail(new SimulationFault({ reason: "no match" }));

export class Match extends Context.Service<
  Match,
  {
    readonly get: () => Effect.Effect<MatchState, SimulationFault>;
    readonly replace: (state: MatchState) => Effect.Effect<void>;
    readonly modify: (f: (s: MatchState) => void) => Effect.Effect<void, SimulationFault>;
    readonly snapshot: () => Effect.Effect<Snapshot, SimulationFault>;
  }
>()("@gimped/sim/Match") {
  static readonly layer = Layer.effect(
    Match,
    Effect.gen(function* () {
      const state = yield* Ref.make<MatchState | undefined>(undefined);

      const get = Effect.fn("Match.get")(function* () {
        const current = yield* Ref.get(state);
        if (current === undefined) {
          return yield* noMatch();
        }
        return current;
      });

      const replace = Effect.fn("Match.replace")(function* (next: MatchState) {
        yield* Ref.set(state, next);
      });

      const modify = Effect.fn("Match.modify")(function* (f: (s: MatchState) => void) {
        const current = yield* Ref.get(state);
        if (current === undefined) {
          return yield* noMatch();
        }
        f(current);
      });

      const snapshot = Effect.fn("Match.snapshot")(function* () {
        const current = yield* get();
        return {
          timeMs: current.timeMs,
          ended: current.ended,
          fighters: current.fighters.map((f) => ({
            entityId: f.entityId,
            team: f.team,
            x: f.x,
            y: f.y,
            lives: f.lives,
            damage: f.damage,
            score: f.score,
            ko: f.ko,
          })),
        };
      });

      return Match.of({ get, replace, modify, snapshot });
    }),
  );
}
