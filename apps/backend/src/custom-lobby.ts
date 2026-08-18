import { BitReader, BitWriter } from "./bitstream.ts";
import { STUB_DISPLAY_NAME, STUB_USER_ID } from "./login-accepted.ts";

export const STUB_ROOM_CODE = "GIM1";
/** RegionTypes.xml Atlanta — first AvailableForCustom region (not Template/Anonymous). */
export const STUB_REGION_ID = 2;
/** Default Timed max players; class_104.method_6165 falls back to var_8259. */
export const STUB_MAX_PLAYERS = 4;
/** class_40.var_14290 — default bot controller sent by class_487.method_3314. */
export const BOT_CONTROLLER = 5;

export type CustomLobby = {
  readonly _tag: "CustomLobby";
  readonly roomId: number;
  readonly roomCode: string;
  readonly hostUserId: number;
  readonly regionId: number;
  readonly maxPlayers: number;
};

export type LobbySettings = {
  readonly _tag: "LobbySettings";
  readonly playlistId: number;
  readonly customGameType: number;
  readonly maxPlayers: number;
  readonly regionId: number;
};

export type AddBot = {
  readonly _tag: "AddBot";
  readonly controller: number;
};

const writeEmptyList = (bits: BitWriter): void => {
  bits.writeBool(false);
};

const expectEmptyList = (bits: BitReader, name: string): void => {
  if (bits.readBool()) throw new RangeError(`stub customLobby expected empty ${name}`);
};

export const writeTimedRuleset = (bits: BitWriter): void => {
  bits.writePackedU32(0);
  bits.writePackedU32(STUB_MAX_PLAYERS);
  bits.writePackedU32(180);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(1);
  bits.writePackedU32(0);
  bits.writePackedU32(100);
  bits.writePackedU32(100);
  bits.writePackedU32(1);
  bits.writePackedU32(2);
  bits.writePackedU32(2);
  bits.writePackedU32(4);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
};

const writeSettings = (bits: BitWriter, maxPlayers: number, regionId: number): void => {
  bits.writePackedU32(0);
  bits.writePackedU32(1);
  bits.writePackedU24(maxPlayers);
  writeTimedRuleset(bits);
  bits.writePackedU32(0);
  bits.writeU8(regionId);
  bits.writePackedU24(0);
  bits.writeBool(false);
  bits.writeBool(false);
};

const writeHost = (bits: BitWriter): void => {
  bits.writeBool(false);
  bits.writePackedU32(STUB_USER_ID);
  bits.writeString(STUB_DISPLAY_NAME);
  bits.writeString("");
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writeString("");
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU24(0);
  bits.writePackedU32(0);
  bits.writePackedU24(0);
  bits.writeBool(false);
  bits.writePackedU32(0);
};

/** LinkUpdater.method_5878 body used by method_8229 (2448). */
export const encodeLobbySettings = (
  maxPlayers = STUB_MAX_PLAYERS,
  regionId = STUB_REGION_ID,
): Uint8Array => {
  const bits = new BitWriter();
  writeSettings(bits, maxPlayers, regionId);
  return bits.toUint8Array();
};

/**
 * method_875 (37) writes a room-code string after the region byte;
 * method_5878 / method_8229 (2448) does not read it.
 */
export const settingsAckFromClient = (payload: Uint8Array): Uint8Array => {
  const src = new BitReader(payload);
  const dst = new BitWriter();
  const playlistId = src.readPackedU32();
  const customGameType = src.readPackedU32();
  dst.writePackedU32(playlistId);
  dst.writePackedU32(customGameType);
  if (playlistId === 0) {
    dst.writePackedU24(src.readPackedU24());
    for (let i = 0; i < 15; i++) dst.writePackedU32(src.readPackedU32());
  }
  dst.writePackedU32(src.readPackedU32());
  dst.writeU8(src.readU8());
  src.readString();
  dst.writePackedU24(src.readPackedU24());
  dst.writeBool(src.readBool());
  dst.writeBool(src.readBool());
  return dst.toUint8Array();
};

export const decodeLobbySettings = (payload: Uint8Array): LobbySettings => {
  const bits = new BitReader(payload);
  const playlistId = bits.readPackedU32();
  const customGameType = bits.readPackedU32();
  const maxPlayers = playlistId === 0 ? bits.readPackedU24() : 0;
  if (playlistId === 0) {
    for (let i = 0; i < 15; i++) bits.readPackedU32();
  }
  bits.readPackedU32();
  const regionId = bits.readU8();
  bits.readPackedU24();
  bits.readBool();
  bits.readBool();
  return { _tag: "LobbySettings", playlistId, customGameType, maxPlayers, regionId };
};

/** LinkUpdater.method_4037 / method_5878 payload for a Default custom room. */
export const encodeCustomLobby = (): Uint8Array => {
  const bits = new BitWriter();
  bits.writePackedU32(1);
  bits.writePackedU32(0);
  writeSettings(bits, STUB_MAX_PLAYERS, STUB_REGION_ID);
  bits.writeBool(false);
  bits.writePackedU32(STUB_USER_ID);
  bits.writeBool(false);
  bits.writeBool(false);
  bits.writeBool(false);
  bits.writePackedU32(0);
  bits.writeString(STUB_ROOM_CODE);
  bits.writeBool(false);
  bits.writeBool(true);
  writeHost(bits);
  writeEmptyList(bits);
  writeEmptyList(bits);
  writeEmptyList(bits);
  writeEmptyList(bits);
  return bits.toUint8Array();
};

export const decodeCustomLobby = (payload: Uint8Array): CustomLobby => {
  const bits = new BitReader(payload);
  const roomId = bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  const maxPlayers = bits.readPackedU24();
  for (let i = 0; i < 15; i++) bits.readPackedU32();
  bits.readPackedU32();
  const regionId = bits.readU8();
  bits.readPackedU24();
  bits.readBool();
  bits.readBool();
  bits.readBool();
  const hostUserId = bits.readPackedU32();
  bits.readBool();
  bits.readBool();
  bits.readBool();
  bits.readPackedU32();
  const roomCode = bits.readString();
  bits.readBool();
  if (!bits.readBool()) throw new RangeError("stub customLobby expected host player");
  bits.readBool();
  bits.readPackedU32();
  bits.readString();
  bits.readString();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readString();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU24();
  bits.readPackedU32();
  bits.readPackedU24();
  bits.readBool();
  bits.readPackedU32();
  expectEmptyList(bits, "players");
  expectEmptyList(bits, "playerUpdates");
  expectEmptyList(bits, "bans");
  expectEmptyList(bits, "spectators");
  return { _tag: "CustomLobby", roomId, roomCode, hostUserId, regionId, maxPlayers };
};

/** LinkUpdater.method_5838 bot branch (first bool true). */
export const encodeAddBot = (controller = BOT_CONTROLLER): Uint8Array => {
  const bits = new BitWriter();
  bits.writeBool(true);
  bits.writePackedU32(controller);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  return bits.toUint8Array();
};

export const decodeAddBot = (payload: Uint8Array): AddBot => {
  const bits = new BitReader(payload);
  if (!bits.readBool()) throw new RangeError("stub addBot expected bot branch");
  const controller = bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  return { _tag: "AddBot", controller };
};

export type AddBotRequest = {
  readonly add: boolean;
  readonly controller: number;
};

export const decodeAddBotRequest = (payload: Uint8Array): AddBotRequest => {
  const bits = new BitReader(payload);
  return { add: bits.readBool(), controller: bits.readPackedU32() };
};
