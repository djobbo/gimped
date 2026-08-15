import { Layer } from "effect";
import { boxStage, stockTables } from "./fixtures.ts";
import { LevelCollision } from "./LevelCollision.ts";
import { Simulation } from "./Simulation.ts";
import { Tables } from "./Tables.ts";

export const TestLive = Simulation.Default.pipe(
  Layer.provide(Tables.make(stockTables())),
  Layer.provide(LevelCollision.make(boxStage())),
);
