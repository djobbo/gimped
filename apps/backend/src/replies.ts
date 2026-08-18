import {
  encodeAssignGameServer,
  STUB_GAME_HOST,
  STUB_GAME_TCP_PORT,
  STUB_GAME_TOKEN,
  STUB_GAME_UDP_PORT,
  STUB_LEVEL_ID,
} from "./assign-game-server.ts";
import { BitWriter } from "./bitstream.ts";
import {
  decodeAddBotRequest,
  encodeAddBot,
  encodeCustomLobby,
  settingsAckFromClient,
} from "./custom-lobby.ts";
import type { TcpFrame } from "./framing.ts";
import { encodeLoginAccepted, STUB_USER_ID } from "./login-accepted.ts";
import { PacketType } from "./packets.ts";

/** Non-empty salt for LinkUpdater.method_6530 → class_139.var_14332. */
export const LOGIN_CHALLENGE = "gimped";

export const repliesFor = (frame: TcpFrame): ReadonlyArray<TcpFrame> => {
  if (frame.type === PacketType.clientVersion) {
    const bits = new BitWriter();
    bits.writeString(LOGIN_CHALLENGE);
    return [{ type: PacketType.loginChallenge, seq: undefined, payload: bits.toUint8Array() }];
  }
  if (frame.type === PacketType.loginRequest || frame.type === PacketType.loginRequestAlt) {
    return [{ type: PacketType.loginAccepted, seq: undefined, payload: encodeLoginAccepted() }];
  }
  if (frame.type === PacketType.keepalivePing) {
    return [{ type: PacketType.keepalivePing, seq: undefined, payload: new Uint8Array() }];
  }
  if (frame.type === PacketType.createCustomRoom) {
    return [{ type: PacketType.customLobby, seq: undefined, payload: encodeCustomLobby() }];
  }
  if (frame.type === PacketType.updateSettings) {
    try {
      return [
        {
          type: PacketType.lobbySettings,
          seq: undefined,
          payload: settingsAckFromClient(frame.payload),
        },
      ];
    } catch {
      return [];
    }
  }
  if (frame.type === PacketType.addBot) {
    try {
      if (!decodeAddBotRequest(frame.payload).add) return [];
      return [{ type: PacketType.lobbyJoin, seq: undefined, payload: encodeAddBot() }];
    } catch {
      return [];
    }
  }
  if (frame.type === PacketType.startMatch) {
    return [
      {
        type: PacketType.assignGameServer,
        seq: undefined,
        payload: encodeAssignGameServer({
          userId: STUB_USER_ID,
          levelId: STUB_LEVEL_ID,
          token: STUB_GAME_TOKEN,
          host: STUB_GAME_HOST,
          tcpPort: STUB_GAME_TCP_PORT,
          udpPort: STUB_GAME_UDP_PORT,
          useNetworkNext: false,
        }),
      },
    ];
  }
  return [];
};
