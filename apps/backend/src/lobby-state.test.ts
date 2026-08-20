import { describe, expect, it } from "@effect/vitest";
import {
  applyAddBotRequest,
  applyLocalGuestJoin,
  applyUpdateSettings,
  initialLobbyState,
  rulesetFromArray,
} from "./lobby-state.ts";

describe("lobby state", () => {
  it("stores updateSettings max players and ruleset", () => {
    const state = applyUpdateSettings(initialLobbyState(), {
      playlistId: 0,
      customGameType: 1,
      maxPlayers: 6,
      ruleset: rulesetFromArray(Array.from({ length: 15 }, (_, i) => (i === 2 ? 300 : 0))),
      levelPick: 0,
      regionId: 2,
      flagsA: false,
      flagsB: false,
    });
    expect(state.maxPlayers).toBe(6);
    expect(state.ruleset[2]).toBe(300);
  });

  it("tracks bot add", () => {
    const state = applyAddBotRequest(initialLobbyState(), { add: true, controller: 5 });
    expect(state.bots).toHaveLength(1);
    expect(state.bots[0]?.entityId).toBe(2);
  });

  it("tracks local guest join by controller", () => {
    const state = applyLocalGuestJoin(initialLobbyState(), 1);
    expect(state.guests).toHaveLength(1);
    expect(state.guests[0]).toMatchObject({
      controller: 1,
      localIndex: 1,
      entityId: 2,
    });
    expect(applyLocalGuestJoin(state, 1).guests).toHaveLength(1);
  });
});
