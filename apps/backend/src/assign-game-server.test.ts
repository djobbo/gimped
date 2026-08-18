import { describe, expect, it } from "@effect/vitest";
import { decodeAssignGameServer, encodeAssignGameServer } from "./assign-game-server.ts";
import { STUB_USER_ID } from "./login-accepted.ts";

describe("assign game server", () => {
  it("round-trips LinkUpdater.method_3206 fields from the allocation", () => {
    const assigned = {
      userId: STUB_USER_ID,
      levelId: 1,
      token: "gimped",
      host: "127.0.0.1",
      tcpPort: 54321,
      udpPort: 54322,
      useNetworkNext: false,
    };
    expect(decodeAssignGameServer(encodeAssignGameServer(assigned))).toEqual({
      _tag: "AssignGameServer",
      ...assigned,
    });
  });
});
