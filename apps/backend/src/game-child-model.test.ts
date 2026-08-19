import { describe, expect, it } from "@effect/vitest";
import { initialGameChildState } from "./game-child-model.ts";

describe("game child model", () => {
  it("starts in waitingForConnect with empty entities", () => {
    const state = initialGameChildState(false);
    expect(state.phase).toBe("waitingForConnect");
    expect(state.includeBot).toBe(false);
    expect(state.connected).toBe(false);
    expect(state.tick).toBe(0);
    expect(state.clientTick).toBe(0);
    expect(state.simReady).toBe(false);
    expect(state.entities).toEqual([]);
  });

  it("records includeBot from the match spec", () => {
    expect(initialGameChildState(true).includeBot).toBe(true);
  });
});
