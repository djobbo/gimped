import { BitWriter } from "./bitstream.ts";
import {
  customLobbyFrame,
  decodeAddBotRequest,
  encodeAddBot,
  lobbyJoinFrame,
  lobbySettingsFrame,
  parseUpdateSettings,
  settingsAckFromClient,
} from "./custom-lobby.ts";
import type { TcpFrame } from "./framing.ts";
import { encodeLoginAccepted } from "./login-accepted.ts";
import {
  applyAddBotRequest,
  applyLegendPickToState,
  applyUpdateSettings,
  initialLobbyState,
  type LobbyState,
} from "./lobby-state.ts";
import { decodeLegendPick } from "./legend-pick.ts";
import { PacketType } from "./packets.ts";

/** Non-empty salt for LinkUpdater.method_6530 → class_139.var_14332. */
export const LOGIN_CHALLENGE = "gimped";

const lobbyRefresh = (
  state: LobbyState,
  options?: { readonly includeHeroUpdate?: boolean },
): ReadonlyArray<TcpFrame> => [customLobbyFrame(state, options)];

export const repliesFor = (
  frame: TcpFrame,
  lobby: LobbyState = initialLobbyState(),
): ReadonlyArray<TcpFrame> => handleFrame(frame, lobby).replies;

export type HandleFrameResult = {
  readonly replies: ReadonlyArray<TcpFrame>;
  readonly lobby: LobbyState;
};

export const handleFrame = (
  frame: TcpFrame,
  lobby: LobbyState = initialLobbyState(),
): HandleFrameResult => {
  if (frame.type === PacketType.clientVersion) {
    const bits = new BitWriter();
    bits.writeString(LOGIN_CHALLENGE);
    return {
      lobby,
      replies: [{ type: PacketType.loginChallenge, seq: undefined, payload: bits.toUint8Array() }],
    };
  }
  if (frame.type === PacketType.loginRequest || frame.type === PacketType.loginRequestAlt) {
    return {
      lobby,
      replies: [{ type: PacketType.loginAccepted, seq: undefined, payload: encodeLoginAccepted() }],
    };
  }
  if (frame.type === PacketType.keepalivePing) {
    return {
      lobby,
      replies: [{ type: PacketType.keepalivePing, seq: undefined, payload: new Uint8Array() }],
    };
  }
  if (frame.type === PacketType.createCustomRoom) {
    const next = initialLobbyState();
    return { lobby: next, replies: lobbyRefresh(next) };
  }
  if (frame.type === PacketType.updateSettings) {
    try {
      const parsed = parseUpdateSettings(frame.payload);
      const next = applyUpdateSettings(lobby, parsed);
      return {
        lobby: next,
        replies: [
          {
            type: PacketType.lobbySettings,
            seq: undefined,
            payload: settingsAckFromClient(frame.payload),
          },
        ],
      };
    } catch {
      return { lobby, replies: [] };
    }
  }
  if (frame.type === PacketType.legendPick) {
    try {
      const pick = decodeLegendPick(frame.payload);
      const next = applyLegendPickToState(lobby, pick);
      // Client updates legend select locally (method_6666); a 2445 refresh re-inits the lobby.
      return { lobby: next, replies: [] };
    } catch {
      return { lobby, replies: [] };
    }
  }
  if (frame.type === PacketType.addBot) {
    try {
      const request = decodeAddBotRequest(frame.payload);
      const next = applyAddBotRequest(lobby, request);
      const changed = next.bots.length !== lobby.bots.length;
      if (!changed) return { lobby: next, replies: [] };
      if (!request.add) return { lobby: next, replies: [] };
      return {
        lobby: next,
        replies: [lobbyJoinFrame(request.controller)],
      };
    } catch {
      return { lobby, replies: [] };
    }
  }
  return { lobby, replies: [] };
};

/** @deprecated use lobbySettingsFrame */
export { encodeAddBot, lobbyJoinFrame, lobbySettingsFrame };
