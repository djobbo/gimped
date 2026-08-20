import { BitWriter } from "./bitstream.ts";
import {
  customLobbyFrame,
  decodeAddBotRequest,
  encodeAddBot,
  lobbyGuestJoinFrame,
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
  applyLocalGuestJoin,
  applyUpdateSettings,
  initialLobbyState,
  nextGuestController,
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

const acceptLocalGuest = (
  lobby: LobbyState,
  controller: number,
  source: string,
): HandleFrameResult => {
  // Empty packet 80 cannot name the device. If a guest seat already exists, re-ack
  // it instead of minting another controller (1→2→3 spam while stuck in join mode).
  if (source === "packet-80" && lobby.guests.length > 0) {
    const last = lobby.guests[lobby.guests.length - 1]!;
    return { lobby, replies: [lobbyGuestJoinFrame(last)] };
  }
  const next = applyLocalGuestJoin(lobby, controller);
  const guest = next.guests[next.guests.length - 1];
  const changed = next.guests.length !== lobby.guests.length && guest !== undefined;
  if (!changed || guest === undefined) return { lobby: next, replies: [] };
  // 2449 claims the seat; 2445 rebuilds the lobby so method_2849 can assign
  // selectable legends. includeHeroSlots preserves the host's prior pick.
  return {
    lobby: next,
    replies: [lobbyGuestJoinFrame(guest), customLobbyFrame(next, { includeHeroSlots: true })],
  };
};

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
  if (frame.type === PacketType.localJoin) {
    return acceptLocalGuest(lobby, nextGuestController(lobby), "packet-80");
  }
  if (frame.type === PacketType.addBot) {
    try {
      const request = decodeAddBotRequest(frame.payload);
      // bool false + controller = local keyboard claim (method_7849), not bot remove.
      if (!request.add) {
        return acceptLocalGuest(lobby, request.controller, "packet-44-false");
      }
      const next = applyAddBotRequest(lobby, request);
      const changed = next.bots.length !== lobby.bots.length;
      if (!changed) return { lobby: next, replies: [] };
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
