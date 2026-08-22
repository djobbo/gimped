import { Match } from "effect";
import { BitReader } from "./bitstream.ts";
import { decodeAssignGameServer } from "./assign-game-server.ts";
import {
  decodeAddBot,
  decodeAddBotRequest,
  decodeCustomLobby,
  decodeLobbySettings,
} from "./custom-lobby.ts";
import { decodeGameConnect } from "./game-connect.ts";
import {
  decodeEntitySpawn,
  decodeGameServerReady,
  decodePostConnectAck,
  decodeSessionSync,
} from "./game-sync.ts";
import { decodeMove, decodeSimReady, decodeTickAck } from "./game-input.ts";
import { decodeLegendPick } from "./legend-pick.ts";
import { decodeMatchSetup } from "./match-setup.ts";
import { decodeLoginAccepted } from "./login-accepted.ts";
import type { DecodedPayload } from "./messages.ts";
import { PacketType } from "./packets.ts";
export type { DecodedPayload } from "./messages.ts";

const decodeLoginRequest = (payload: Uint8Array) => {
  const bits = new BitReader(payload);
  const email = bits.readString();
  bits.readString();
  const nameHint = bits.readString();
  bits.readString();
  const ticketBytes = bits.readPackedU32();
  bits.readBytes(ticketBytes);
  bits.readString();
  bits.readU8();
  bits.readPackedU32();
  bits.readString();
  return { _tag: "LoginRequest" as const, email, ticketBytes, nameHint };
};

export const decodePayload = (type: number, payload: Uint8Array): DecodedPayload => {
  try {
    return Match.value(type).pipe(
      Match.when(PacketType.protocolHello, () => {
        const bits = new BitReader(payload);
        return { _tag: "ProtocolHello" as const, text: bits.readString() };
      }),
      Match.when(PacketType.clientVersion, () => {
        const bits = new BitReader(payload);
        return {
          _tag: "ClientVersion" as const,
          versionStamp: bits.readPackedU32(),
          platformId: bits.readPackedU32(),
        };
      }),
      Match.whenOr(PacketType.loginRequest, PacketType.loginRequestAlt, () =>
        decodeLoginRequest(payload),
      ),
      Match.when(PacketType.loginAccepted, () => decodeLoginAccepted(payload)),
      Match.when(PacketType.createCustomRoom, () => {
        const bits = new BitReader(payload);
        return {
          _tag: "CreateCustomRoom" as const,
          flags: bits.readPackedU32(),
          playlistId: bits.readPackedU32(),
          customGameType: bits.readPackedU32(),
        };
      }),
      Match.when(PacketType.customLobby, () => decodeCustomLobby(payload)),
      Match.when(PacketType.lobbySettings, () => decodeLobbySettings(payload)),
      Match.when(PacketType.legendPick, () => {
        const pick = decodeLegendPick(payload);
        return {
          _tag: "LegendPick" as const,
          isBot: pick.isBot,
          slotId: pick.slotId,
          heroId: pick.heroId,
          ready: pick.ready,
        };
      }),
      Match.when(PacketType.addBot, () => {
        const request = decodeAddBotRequest(payload);
        return { _tag: "AddBot" as const, controller: request.controller };
      }),
      Match.when(PacketType.lobbyJoin, () => decodeAddBot(payload)),
      Match.when(PacketType.startMatch, () => ({ _tag: "StartMatch" as const })),
      Match.when(PacketType.assignGameServer, () => decodeAssignGameServer(payload)),
      Match.when(PacketType.gameConnect, () => decodeGameConnect(payload)),
      Match.when(PacketType.matchSetup, () => decodeMatchSetup(payload)),
      Match.when(PacketType.sessionSync, () => decodeSessionSync(payload)),
      Match.when(PacketType.entitySpawn, () => decodeEntitySpawn(payload)),
      Match.when(PacketType.gameServerReady, () => decodeGameServerReady(payload)),
      Match.whenOr(PacketType.postConnectAck, PacketType.levelReady, () =>
        decodePostConnectAck(payload),
      ),
      Match.when(PacketType.simReady, () => decodeSimReady(payload)),
      Match.when(PacketType.tickAck, () => decodeTickAck(payload)),
      Match.when(PacketType.moveInput, () => {
        const move = decodeMove(payload);
        return {
          _tag: "MoveInput" as const,
          entityId: move.entityId,
          tick: move.tick,
          input: move.input,
        };
      }),
      Match.whenOr(
        PacketType.introPlayerSync,
        PacketType.introEntitySync,
        PacketType.introAuxSync,
        () => ({ _tag: "IntroSync" as const, size: payload.length }),
      ),
      Match.when(PacketType.tickPulse, () =>
        Match.value(payload.length).pipe(
          Match.when(0, () => ({ _tag: "TickPulseEcho" as const })),
          Match.orElse(() => {
            const tickBits = new BitReader(payload);
            return { _tag: "TickPulse" as const, tick: tickBits.readPackedU32() };
          }),
        ),
      ),
      Match.when(PacketType.inputBroadcast, () => ({
        _tag: "InputBroadcast" as const,
        size: payload.length,
      })),
      Match.when(PacketType.udpTunnel, () => ({
        _tag: "UdpTunnel" as const,
        size: payload.length,
      })),
      Match.when(PacketType.entityState, () => {
        const bits = new BitReader(payload);
        return {
          _tag: "EntityState" as const,
          entityId: bits.readPackedU32(),
          tick: bits.readPackedU32(),
          code: bits.readPackedU32(),
        };
      }),
      Match.when(PacketType.entityRespawn, () => ({
        _tag: "EntityRespawn" as const,
        size: payload.length,
      })),
      Match.orElse(() => ({ _tag: "Unknown" as const })),
    );
  } catch {
    return { _tag: "Unknown" };
  }
};
