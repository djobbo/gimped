import type { Replay } from "@gimped/replay";
import { Context, Effect, Layer } from "effect";
import { UnsupportedMatch } from "./errors.ts";
import { Tables } from "./Tables.ts";

const fail = (reason: string) => new UnsupportedMatch({ reason });

export class MatchRules extends Context.Service<
  MatchRules,
  {
    readonly check: (replay: Replay) => Effect.Effect<void, UnsupportedMatch>;
  }
>()("@gimped/sim/MatchRules") {
  static readonly layer = Layer.effect(
    MatchRules,
    Effect.gen(function* () {
      const tables = yield* Tables;
      const check = Effect.fn("MatchRules.check")(function* (replay: Replay) {
        const scoring = tables.scoring.get(replay.rules.scoringTypeId);
        if (scoring?.name !== "Stock") {
          return yield* fail(`scoring ${replay.rules.scoringTypeId} is not Stock`);
        }
        if (replay.heroSlotCount !== 1) {
          return yield* fail("heroSlotCount must be 1");
        }
        if (replay.rules.weaponSpawnRateId !== 0 || replay.rules.gadgetSpawnRateId !== 0) {
          return yield* fail("weapon/gadget spawns must be off");
        }
        const n = replay.players.length;
        if (n !== 2 && n !== 4) {
          return yield* fail(`player count ${n}`);
        }
        const teams = new Map<number, number>();
        for (const player of replay.players) {
          teams.set(player.team, (teams.get(player.team) ?? 0) + 1);
        }
        if (teams.size !== 2) {
          return yield* fail("need exactly two teams");
        }
        const counts = [...teams.values()];
        const expected = n === 2 ? 1 : 2;
        if (counts.some((c) => c !== expected)) {
          return yield* fail("uneven teams");
        }
      });
      return MatchRules.of({ check });
    }),
  );
}
