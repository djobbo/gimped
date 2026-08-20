import { describe, expect, it } from "@effect/vitest";
import {
  initialGameChildState,
  shouldBeginFight,
  FIGHT_PHASE_TICK_MS,
  INTRO_QUIET_MS,
  nextAuthoritativeTick,
} from "./game-child-model.ts";
import { STUB_USER_ID } from "./login-accepted.ts";

describe("game child model", () => {
  it("starts in waitingForConnect with seeded player state", () => {
    const state = initialGameChildState(false);
    expect(state.phase).toBe("waitingForConnect");
    expect(state.includeBot).toBe(false);
    expect(state.connected).toBe(false);
    expect(state.tick).toBe(0);
    expect(state.clientTick).toBe(0);
    expect(state.clientSimTick).toBe(0);
    expect(state.simReady).toBe(false);
    expect(state.entityInputs).toEqual({});
    expect(state.udpAckSeq).toBe(0);
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

  it("shouldBeginFight only after client sim reaches fight phase and intro is quiet", () => {
    const now = Date.now();
    const intro = {
      ...initialGameChildState(false),
      phase: "activeMatch" as const,
      clientSimTick: 352,
      enteredActiveMatchAtMs: now - 10_000,
    };
    expect(shouldBeginFight(intro, now)).toBe(false);
    const fightPhaseNoQuiet = {
      ...intro,
      clientSimTick: FIGHT_PHASE_TICK_MS,
      lastIntroSyncAtMs: now - 100,
    };
    expect(shouldBeginFight(fightPhaseNoQuiet, now)).toBe(false);
    const fight = {
      ...intro,
      clientSimTick: FIGHT_PHASE_TICK_MS,
      lastIntroSyncAtMs: now - INTRO_QUIET_MS,
    };
    expect(shouldBeginFight(fight, now)).toBe(true);
  });

  it("shouldBeginFight without intro sync when client sim reaches fight phase via inputs", () => {
    const now = Date.now();
    const state = {
      ...initialGameChildState(true),
      phase: "activeMatch" as const,
      clientSimTick: 6336,
      lastIntroSyncAtMs: 0,
    };
    expect(shouldBeginFight(state, now)).toBe(true);
  });

  it("nextAuthoritativeTick advances one frame at a time when client is ahead", () => {
    const state = {
      ...initialGameChildState(false),
      tick: 400,
      clientSimTick: 6608,
      simReady: true,
    };
    expect(nextAuthoritativeTick(state)).toBe(416);
  });

  it("nextAuthoritativeTick waits when client sim has not moved past server tick", () => {
    const state = {
      ...initialGameChildState(false),
      tick: 7088,
      clientSimTick: 7088,
      simReady: true,
    };
    expect(nextAuthoritativeTick(state)).toBe(7088);
  });
});
