import type { Replay } from "@gimped/replay";
import { Context, Effect, Layer } from "effect";
import { SimulationFault } from "./errors.ts";
import { Match } from "./Match.ts";

export class Input extends Context.Service<
  Input,
  {
    readonly load: (rows: Replay["inputs"]) => Effect.Effect<void, SimulationFault>;
    readonly apply: () => Effect.Effect<void, SimulationFault>;
  }
>()("@gimped/sim/Input") {
  static readonly layer = Layer.effect(
    Input,
    Effect.gen(function* () {
      const match = yield* Match;

      const load = Effect.fn("Input.load")(function* (rows: Replay["inputs"]) {
        yield* match.modify((s) => {
          s.inputs = [...rows];
        });
      });

      const apply = Effect.fn("Input.apply")(function* () {
        const state = yield* match.get();
        const fighterIds = new Set(state.fighters.map((f) => f.entityId));

        for (const row of state.inputs) {
          if (row.time <= state.timeMs && !fighterIds.has(row.entityId)) {
            return yield* Effect.fail(
              new SimulationFault({ reason: `unknown entityId ${row.entityId}` }),
            );
          }
        }

        const latestByEntity = new Map<number, Replay["inputs"][number]>();
        for (const row of state.inputs) {
          if (row.time <= state.timeMs) {
            latestByEntity.set(row.entityId, row);
          }
        }

        yield* match.modify((s) => {
          for (const fighter of s.fighters) {
            const row = latestByEntity.get(fighter.entityId);
            fighter.prevInput = fighter.input;
            fighter.input = row?.input;
          }
        });
      });

      return Input.of({ load, apply });
    }),
  );
}
