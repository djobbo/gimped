import { describe, expect, it } from "@effect/vitest";
import { initialGameChildState } from "./game-child-model.ts";
import { STUB_USER_ID } from "./login-accepted.ts";

describe("game child model", () => {
  it("starts in waitingForConnect with seeded player state", () => {
    const state = initialGameChildState(false);
    expect(state.phase).toBe("waitingForConnect");
    expect(state.includeBot).toBe(false);
    expect(state.connected).toBe(false);
    expect(state.tick).toBe(0);
    expect(state.clientTick).toBe(0);
    expect(state.simReady).toBe(false);
    expect(state.entities).toEqual([
      {
        entityId: 1,
        userId: STUB_USER_ID,
        stocks: 3,
        damage: 0,
        x: 0,
        y: 0,
      },
    ]);
  });

  it("records includeBot from the match spec", () => {
    expect(initialGameChildState(true).includeBot).toBe(true);
  });

  it("starts player and bot with fresh stocks and zero damage", () => {
    const state = initialGameChildState(true);
    expect(state.entities).toEqual([
      {
        entityId: 1,
        userId: STUB_USER_ID,
        stocks: 3,
        damage: 0,
        x: 0,
        y: 0,
      },
      {
        entityId: 2,
        userId: 0,
        stocks: 3,
        damage: 0,
        x: 0,
        y: 0,
      },
    ]);
  });
});
