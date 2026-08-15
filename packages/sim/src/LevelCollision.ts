import { Context, Layer } from "effect";
import type { LevelCollisionData } from "./domain.ts";

export class LevelCollision extends Context.Service<LevelCollision, LevelCollisionData>()(
  "@gimped/sim/LevelCollision",
) {
  static readonly make = (data: LevelCollisionData) =>
    Layer.succeed(LevelCollision, LevelCollision.of(data));
}
