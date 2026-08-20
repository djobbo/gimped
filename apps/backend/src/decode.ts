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
import { PacketType } from "./packets.ts";

export type DecodedPayload =
  | { readonly _tag: "ProtocolHello"; readonly text: string }
  | { readonly _tag: "ClientVersion"; readonly versionStamp: number; readonly platformId: number }
  | {
      readonly _tag: "LoginRequest";
      readonly email: string;
      readonly ticketBytes: number;
      readonly nameHint: string;
    }
  | { readonly _tag: "LoginAccepted"; readonly userId: number; readonly displayName: string }
  | {
      readonly _tag: "CreateCustomRoom";
      readonly flags: number;
      readonly playlistId: number;
      readonly customGameType: number;
    }
  | {
      readonly _tag: "CustomLobby";
      readonly roomId: number;
      readonly roomCode: string;
      readonly hostUserId: number;
      readonly regionId: number;
      readonly maxPlayers: number;
    }
  | {
      readonly _tag: "LobbySettings";
      readonly playlistId: number;
      readonly customGameType: number;
      readonly maxPlayers: number;
      readonly regionId: number;
    }
  | {
      readonly _tag: "LegendPick";
      readonly isBot: boolean;
      readonly slotId: number;
      readonly heroId: number;
      readonly ready: boolean;
    }
  | { readonly _tag: "AddBot"; readonly controller: number }
  | { readonly _tag: "StartMatch" }
  | { readonly _tag: "GameConnect"; readonly userId: number; readonly token: string }
  | {
      readonly _tag: "MatchSetup";
      readonly custom: boolean;
      readonly playerCount: number;
      readonly hostUserId: number;
    }
  | { readonly _tag: "SessionSync"; readonly clearTransfer: boolean; readonly token: string }
  | {
      readonly _tag: "EntitySpawn";
      readonly entities: ReadonlyArray<{
        readonly entityId: number;
        readonly field2: number;
        readonly name: string;
        readonly field4: string;
        readonly field5: number;
        readonly userId: number;
        readonly field7: number;
        readonly field8: boolean;
      }>;
    }
  | { readonly _tag: "GameServerReady"; readonly ready: boolean; readonly tick: number }
  | { readonly _tag: "PostConnectAck" }
  | { readonly _tag: "SimReady" }
  | { readonly _tag: "TickAck"; readonly clientTick: number }
  | {
      readonly _tag: "MoveInput";
      readonly entityId: number;
      readonly x: number;
      readonly y: number;
    }
  | { readonly _tag: "TickPulse"; readonly tick: number }
  | { readonly _tag: "TickPulseEcho" }
  | { readonly _tag: "EntityValue"; readonly entityId: number; readonly value: number }
  | {
      readonly _tag: "AssignGameServer";
      readonly userId: number;
      readonly levelId: number;
      readonly token: string;
      readonly host: string;
      readonly tcpPort: number;
      readonly udpPort: number;
      readonly useNetworkNext: boolean;
    }
  | {
      readonly _tag: "MoveInput";
      readonly entityId: number;
      readonly tick: number;
      readonly input: number;
    }
  | { readonly _tag: "IntroSync"; readonly size: number }
  | { readonly _tag: "Unknown" };

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
    const bits = new BitReader(payload);
    if (type === PacketType.protocolHello) {
      return { _tag: "ProtocolHello", text: bits.readString() };
    }
    if (type === PacketType.clientVersion) {
      return {
        _tag: "ClientVersion",
        versionStamp: bits.readPackedU32(),
        platformId: bits.readPackedU32(),
      };
    }
    if (type === PacketType.loginRequest || type === PacketType.loginRequestAlt) {
      return decodeLoginRequest(payload);
    }
    if (type === PacketType.loginAccepted) {
      return decodeLoginAccepted(payload);
    }
    if (type === PacketType.createCustomRoom) {
      return {
        _tag: "CreateCustomRoom",
        flags: bits.readPackedU32(),
        playlistId: bits.readPackedU32(),
        customGameType: bits.readPackedU32(),
      };
    }
    if (type === PacketType.customLobby) {
      return decodeCustomLobby(payload);
    }
    if (type === PacketType.lobbySettings) {
      return decodeLobbySettings(payload);
    }
    if (type === PacketType.legendPick) {
      const pick = decodeLegendPick(payload);
      return {
        _tag: "LegendPick",
        isBot: pick.isBot,
        slotId: pick.slotId,
        heroId: pick.heroId,
        ready: pick.ready,
      };
    }
    if (type === PacketType.addBot) {
      const request = decodeAddBotRequest(payload);
      return { _tag: "AddBot", controller: request.controller };
    }
    if (type === PacketType.lobbyJoin) {
      return decodeAddBot(payload);
    }
    if (type === PacketType.startMatch) {
      return { _tag: "StartMatch" };
    }
    if (type === PacketType.assignGameServer) {
      return decodeAssignGameServer(payload);
    }
    if (type === PacketType.gameConnect) {
      return decodeGameConnect(payload);
    }
    if (type === PacketType.matchSetup) {
      return decodeMatchSetup(payload);
    }
    if (type === PacketType.sessionSync) {
      return decodeSessionSync(payload);
    }
    if (type === PacketType.entitySpawn) {
      return decodeEntitySpawn(payload);
    }
    if (type === PacketType.gameServerReady) {
      return decodeGameServerReady(payload);
    }
    if (type === PacketType.postConnectAck || type === PacketType.levelReady) {
      return decodePostConnectAck(payload);
    }
    if (type === PacketType.simReady) {
      return decodeSimReady(payload);
    }
    if (type === PacketType.tickAck) {
      return decodeTickAck(payload);
    }
    if (type === PacketType.moveInput) {
      const move = decodeMove(payload);
      return {
        _tag: "MoveInput",
        entityId: move.entityId,
        tick: move.tick,
        input: move.input,
      };
    }
    if (
      type === PacketType.introPlayerSync ||
      type === PacketType.introEntitySync ||
      type === PacketType.introAuxSync
    ) {
      return { _tag: "IntroSync", size: payload.length };
    }
    if (type === PacketType.tickPulse) {
      if (payload.length === 0) {
        return { _tag: "TickPulseEcho" };
      }
      const tickBits = new BitReader(payload);
      return { _tag: "TickPulse", tick: tickBits.readPackedU32() };
    }
    if (type === PacketType.inputBroadcast) {
      return { _tag: "InputBroadcast", size: payload.length };
    }
    if (type === PacketType.udpTunnel) {
      return { _tag: "UdpTunnel", size: payload.length };
    }
    if (type === PacketType.entityState) {
      const bits = new BitReader(payload);
      return {
        _tag: "EntityState",
        entityId: bits.readPackedU32(),
        tick: bits.readPackedU32(),
        code: bits.readPackedU32(),
      };
    }
    if (type === PacketType.entityRespawn) {
      return { _tag: "EntityRespawn", size: payload.length };
    }
  } catch {
    return { _tag: "Unknown" };
  }
  return { _tag: "Unknown" };
};
