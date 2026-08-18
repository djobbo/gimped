import { describe, expect, it } from "@effect/vitest";
import {
  decodeAssignGameServer,
  encodeAssignGameServer,
  STUB_GAME_HOST,
  STUB_GAME_TCP_PORT,
  STUB_GAME_TOKEN,
  STUB_GAME_UDP_PORT,
  STUB_LEVEL_ID,
} from "./assign-game-server.ts";
import { STUB_USER_ID } from "./login-accepted.ts";

describe("assign game server", () => {
  it("round-trips LinkUpdater.method_3206 fields", () => {
    expect(decodeAssignGameServer(encodeAssignGameServer())).toEqual({
      _tag: "AssignGameServer",
      userId: STUB_USER_ID,
      levelId: STUB_LEVEL_ID,
      token: STUB_GAME_TOKEN,
      host: STUB_GAME_HOST,
      tcpPort: STUB_GAME_TCP_PORT,
      udpPort: STUB_GAME_UDP_PORT,
      useNetworkNext: false,
    });
  });
});
