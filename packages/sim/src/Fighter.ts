import { Context, Effect, Layer } from "effect";
import { Collision } from "./Collision.ts";
import type { CollisionLine } from "./domain.ts";
import { InputBits } from "./domain.ts";
import type { SimulationFault } from "./errors.ts";
import { Match } from "./Match.ts";

/** Dump `class_123.var_4334` — entity gravity (Y-down). */
const GRAVITY = 3.75;
/** Dump `class_50.var_12301` — per-frame physics scale. */
const DT = 0.384;
/** Dump `class_123.var_2419` — ground max speed. */
const GROUND_SPEED = 30;

const lineTop = (line: CollisionLine) => Math.min(line.startY, line.endY);

export class Fighter extends Context.Service<
  Fighter,
  {
    readonly step: () => Effect.Effect<void, SimulationFault>;
  }
>()("@gimped/sim/Fighter") {
  static readonly layer = Layer.effect(
    Fighter,
    Effect.gen(function* () {
      const match = yield* Match;
      const collision = yield* Collision;

      const step = Effect.fn("Fighter.step")(function* () {
        const state = yield* match.get();

        for (const fighter of state.fighters) {
          if (!fighter.grounded) {
            // Dump `class_123` integrate: `vy += var_4334 * class_50.var_12301`.
            fighter.vy += GRAVITY * DT;
          }

          const line = yield* collision.groundAt(fighter.x, fighter.y, fighter.vy);
          const nextY = fighter.y + fighter.vy * DT;
          const holdingDown = ((fighter.input ?? 0) & InputBits.down) !== 0;
          const dropThrough = line !== undefined && line.type === 2 && holdingDown;

          if (line !== undefined && nextY >= lineTop(line) && !dropThrough) {
            fighter.y = lineTop(line);
            fighter.vy = 0;
            fighter.grounded = true;
          } else {
            fighter.y = nextY;
            fighter.grounded = false;
          }

          if (fighter.stun === 0) {
            const bits = fighter.input ?? 0;
            if ((bits & InputBits.left) !== 0) {
              fighter.x -= GROUND_SPEED * DT;
              fighter.vx = -GROUND_SPEED;
              fighter.facingLeft = true;
            }
            if ((bits & InputBits.right) !== 0) {
              fighter.x += GROUND_SPEED * DT;
              fighter.vx = GROUND_SPEED;
              fighter.facingLeft = false;
            }
          }

          if (fighter.grounded) {
            const still = yield* collision.groundAt(fighter.x, fighter.y, fighter.vy);
            if (still === undefined) {
              fighter.grounded = false;
            }
          }
        }
      });

      return Fighter.of({ step });
    }),
  );
}
