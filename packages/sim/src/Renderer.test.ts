import { layer } from "@effect/vitest";
import { Effect } from "effect";
import type { Snapshot } from "./domain.ts";
import { Renderer } from "./Renderer.ts";

const snapshot: Snapshot = {
  timeMs: 0,
  ended: false,
  fighters: [
    {
      entityId: 1,
      team: 1,
      x: 0,
      y: 0,
      lives: 3,
      damage: 0,
      score: 0,
      ko: false,
    },
  ],
};

layer(Renderer.layer)("Renderer", (it) => {
  it.effect("present succeeds without throwing", () =>
    Effect.gen(function* () {
      const renderer = yield* Renderer;
      yield* renderer.present(snapshot);
    }),
  );
});
