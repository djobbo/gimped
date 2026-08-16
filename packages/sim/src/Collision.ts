import { Context, Effect, Layer } from "effect";
import type { CollisionLine } from "./domain.ts";
import type { SimulationFault } from "./errors.ts";
import { Match } from "./Match.ts";

/** Dump `class_72.var_8795` — tolerance for “on / just past” a line. */
const EPSILON = 0.01;

const left = (line: CollisionLine) => Math.min(line.startX, line.endX);
const right = (line: CollisionLine) => Math.max(line.startX, line.endX);
const top = (line: CollisionLine) => Math.min(line.startY, line.endY);
const bottom = (line: CollisionLine) => Math.max(line.startY, line.endY);

const isHorizontal = (line: CollisionLine) => line.startY === line.endY;
const isVertical = (line: CollisionLine) => line.startX === line.endX;

export class Collision extends Context.Service<
  Collision,
  {
    readonly groundAt: (
      x: number,
      y: number,
      vy: number,
    ) => Effect.Effect<CollisionLine | undefined, SimulationFault>;
    readonly wallAt: (
      x: number,
      y: number,
    ) => Effect.Effect<CollisionLine | undefined, SimulationFault>;
  }
>()("@gimped/sim/Collision") {
  static readonly layer = Layer.effect(
    Collision,
    Effect.gen(function* () {
      const match = yield* Match;

      const groundAt = Effect.fn("Collision.groundAt")(function* (
        x: number,
        y: number,
        vy: number,
      ) {
        const state = yield* match.get();

        // Moving up: no ground from above (hard or soft).
        if (vy < 0) {
          return undefined;
        }

        let best: CollisionLine | undefined;
        let bestTop = Number.POSITIVE_INFINITY;

        for (const line of state.lines) {
          if (!isHorizontal(line)) {
            continue;
          }
          if (x < left(line) || x > right(line)) {
            continue;
          }

          const lineTop = top(line);

          // Already below the line (passed through): soft always misses;
          // hard also only counts at/crossing (within epsilon past Top).
          if (lineTop < y - EPSILON) {
            continue;
          }

          // Highest platform at or below feet (smallest Top in y-down).
          if (lineTop < bestTop) {
            bestTop = lineTop;
            best = line;
          }
        }

        return best;
      });

      const wallAt = Effect.fn("Collision.wallAt")(function* (x: number, y: number) {
        const state = yield* match.get();

        let best: CollisionLine | undefined;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const line of state.lines) {
          if (!isVertical(line) || line.type !== 1) {
            continue;
          }
          if (Math.abs(x - line.startX) > EPSILON) {
            continue;
          }
          if (y < top(line) - EPSILON || y > bottom(line) + EPSILON) {
            continue;
          }

          const distance = Math.abs(x - line.startX);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = line;
          }
        }

        return best;
      });

      return Collision.of({ groundAt, wallAt });
    }),
  );
}
