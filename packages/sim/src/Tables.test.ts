import { expect, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { boxStage, stockTables } from "./fixtures.ts";
import { LevelCollision } from "./LevelCollision.ts";
import { Tables } from "./Tables.ts";

const Live = Tables.make(stockTables()).pipe(Layer.provideMerge(LevelCollision.make(boxStage())));

layer(Live)("injected tables and stage", (it) => {
  it.effect("exposes STOCK and a hard floor", () =>
    Effect.gen(function* () {
      const tables = yield* Tables;
      const level = yield* LevelCollision;
      expect(tables.scoring.get(1)?.name).toBe("Stock");
      expect(level.lines.some((line) => line.type === 1 && line.startY === 0)).toBe(true);
    }),
  );
});
