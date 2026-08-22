import { BitReader, BitWriter } from "./bitstream.ts";
import type { LobbyState, ParsedUpdateSettings, RulesetFields } from "./lobby-state.ts";
import {
  BOT_CONTROLLER,
  DEFAULT_RULESET,
  STUB_MAX_PLAYERS,
  initialLobbyState,
} from "./lobby-state.ts";
import { STUB_DISPLAY_NAME, STUB_USER_ID } from "./login-accepted.ts";
import type { TcpFrame } from "./framing.ts";
import { PacketType } from "./packets.ts";

export const STUB_ROOM_CODE = "GIM1";
/** Numeric game id shown as `#N` / entered in Join Room (2445 first packed field). */
export const STUB_ROOM_ID = 1;
/** Re-exported lobby defaults live in lobby-state.ts. */
export { BOT_CONTROLLER, STUB_MAX_PLAYERS, STUB_REGION_ID } from "./lobby-state.ts";

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

const readRulesetFields = (bits: BitReader): RulesetFields => {
  const fields = Array.from({ length: 15 }, () => bits.readPackedU32());
  if (fields.length !== 15) throw new RangeError("ruleset must have 15 fields");
  // SAFETY: length check above guarantees the tuple width for RulesetFields.
  return fields as RulesetFields;
};

const writeEmptyList = (bits: BitWriter): void => {
  bits.writeBool(false);
};

const expectEmptyList = (bits: BitReader, name: string): void => {
  if (bits.readBool()) throw new RangeError(`stub customLobby expected empty ${name}`);
};

export const writeRuleset = (bits: BitWriter, ruleset: RulesetFields): void => {
  for (const field of ruleset) bits.writePackedU32(field);
};

export const writeTimedRuleset = (bits: BitWriter): void => {
  writeRuleset(bits, DEFAULT_RULESET);
};

const writeSettings = (bits: BitWriter, state: LobbyState): void => {
  bits.writePackedU32(state.playlistId);
  bits.writePackedU32(state.customGameType);
  if (state.playlistId === 0) {
    bits.writePackedU24(state.maxPlayers);
    writeRuleset(bits, state.ruleset);
  }
  bits.writePackedU32(state.levelPick);
  bits.writeU8(state.regionId);
  bits.writePackedU24(0);
  bits.writeBool(false);
  bits.writeBool(false);
};

const writeHumanPlayerBody = (
  bits: BitWriter,
  fields: {
    readonly localIndex: number;
    readonly controller: number;
    readonly team: number;
    readonly readyLock: number;
    readonly heroSlots: ReadonlyArray<{ readonly heroId: number; readonly costumeId: number }>;
  },
): void => {
  bits.writeBool(false);
  bits.writePackedU32(STUB_USER_ID);
  bits.writeString(STUB_DISPLAY_NAME);
  bits.writeString("");
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writeString("");
  bits.writePackedU32(fields.localIndex);
  bits.writePackedU32(fields.controller);
  bits.writePackedU32(fields.team);
  bits.writePackedU32(fields.readyLock);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU24(0);
  bits.writePackedU32(0);
  bits.writePackedU24(0);
  bits.writeBool(false);
  bits.writePackedU32(fields.heroSlots.length);
  for (const slot of fields.heroSlots) {
    bits.writeBool(false);
    bits.writeBool(false);
    bits.writePackedU32(slot.heroId);
    bits.writePackedU32(slot.costumeId);
    bits.writePackedU32(0);
    bits.writePackedU32(0);
    bits.writePackedU32(0);
    bits.writePackedU32(0);
  }
};

const writeHost = (
  bits: BitWriter,
  state: LobbyState,
  options: { readonly includeHeroSlots?: boolean } = {},
): void => {
  if (options.includeHeroSlots) {
    // Online custom lock-in uses method_2148 → uint(-1) as var_6587 (not 1).
    writeHumanPlayerBody(bits, {
      localIndex: 0,
      controller: 0,
      team: 0,
      readyLock: 0xffffffff,
      heroSlots: state.hostHeroSlots,
    });
    return;
  }
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
  bits.writePackedU32(state.hostHeroId);
  bits.writePackedU32(state.hostCostumeId);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU24(0);
  bits.writePackedU32(0);
  bits.writePackedU24(0);
  bits.writeBool(false);
  // Initial 2445: empty slots; host pick arrives via packet 41 / method_2849.
  bits.writePackedU32(0);
};

const writeLobbyGuest = (bits: BitWriter, guest: LobbyState["guests"][number]): void => {
  writeHumanPlayerBody(bits, {
    localIndex: guest.localIndex,
    controller: guest.controller,
    team: 0,
    readyLock: 0,
    // Empty slots → method_2849 assigns a selectable grid hero.
    heroSlots: [],
  });
};

const writeLobbyBot = (bits: BitWriter, bot: LobbyState["bots"][number]): void => {
  bits.writeBool(false);
  bits.writePackedU32(0);
  bits.writeString("Bot");
  bits.writeString("");
  bits.writePackedU32(0);
  bits.writePackedU32(bot.entityId);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writeBool(false);
  bits.writeBool(true);
  bits.writeBool(true);
  bits.writePackedU32(bot.controller);
  for (let i = 0; i < 6; i++) bits.writePackedU32(0);
  for (let i = 0; i < 8; i++) bits.writePackedU32(0);
  bits.writePackedU24(0);
  bits.writePackedU24(0);
  bits.writeBool(false);
  bits.writePackedU24(0);
  bits.writePackedU32(0);
  bits.writePackedU24(0);
  bits.writePackedU24(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writeString("");
};

const writePlayerHeroUpdates = (bits: BitWriter, state: LobbyState): void => {
  bits.writeBool(true);
  bits.writePackedU32(STUB_USER_ID);
  bits.writeBool(false);
  bits.writePackedU32(state.hostHeroId);
  bits.writePackedU32(state.hostCostumeId);
  bits.writeBool(false);
};

/** LinkUpdater.method_5878 body used by method_8229 (2448). */
export const encodeLobbySettings = (state: LobbyState = initialLobbyState()): Uint8Array => {
  const bits = new BitWriter();
  writeSettings(bits, state);
  return bits.toUint8Array();
};

/**
 * method_875 (37) writes a room-code string after the region byte;
 * method_5878 / method_8229 (2448) does not read it.
 */
export const settingsAckFromClient = (payload: Uint8Array): Uint8Array => {
  const parsed = parseUpdateSettings(payload, { includeRoomCode: false });
  const bits = new BitWriter();
  writeSettings(bits, { ...initialLobbyState(), ...parsed });
  return bits.toUint8Array();
};

export const parseUpdateSettings = (
  payload: Uint8Array,
  options: { readonly includeRoomCode: boolean } = { includeRoomCode: true },
): ParsedUpdateSettings => {
  const bits = new BitReader(payload);
  const playlistId = bits.readPackedU32();
  const customGameType = bits.readPackedU32();
  let maxPlayers = STUB_MAX_PLAYERS;
  let ruleset: RulesetFields = DEFAULT_RULESET;
  if (playlistId === 0) {
    maxPlayers = bits.readPackedU24();
    ruleset = readRulesetFields(bits);
  }
  const levelPick = bits.readPackedU32();
  const regionId = bits.readU8();
  if (options.includeRoomCode) bits.readString();
  bits.readPackedU24();
  const flagsA = bits.readBool();
  const flagsB = bits.readBool();
  return {
    playlistId,
    customGameType,
    maxPlayers,
    ruleset,
    levelPick,
    regionId,
    flagsA,
    flagsB,
  };
};

export const decodeLobbySettings = (payload: Uint8Array): LobbySettings => {
  const parsed = parseUpdateSettings(payload, { includeRoomCode: false });
  return {
    _tag: "LobbySettings",
    playlistId: parsed.playlistId,
    customGameType: parsed.customGameType,
    maxPlayers: parsed.maxPlayers,
    regionId: parsed.regionId,
  };
};

/** LinkUpdater.method_4037 / method_5878 payload for a custom room snapshot. */
export const encodeCustomLobby = (
  state: LobbyState = initialLobbyState(),
  options: {
    readonly roomId?: number;
    readonly includeHeroUpdate?: boolean;
    readonly includeHeroSlots?: boolean;
  } = {},
): Uint8Array => {
  const bits = new BitWriter();
  bits.writePackedU32(options.roomId ?? STUB_ROOM_ID);
  bits.writePackedU32(0);
  writeSettings(bits, state);
  // After settings: bool, hostUserId, then bool → client var_486 = true?1:2
  // false → var_486=2: join sends 44 with controller id (dedupeable).
  // true → var_486=1: join sends empty packet 80 (cannot identify device → ghost seats).
  const onlineJoinModeBool = false;
  bits.writeBool(false);
  bits.writePackedU32(STUB_USER_ID);
  bits.writeBool(onlineJoinModeBool);
  bits.writeBool(false);
  bits.writeBool(false);
  bits.writePackedU32(0);
  bits.writeString(STUB_ROOM_CODE);
  bits.writeBool(false);
  bits.writeBool(true);
  writeHost(bits, state, { includeHeroSlots: options.includeHeroSlots });
  for (const guest of state.guests) {
    bits.writeBool(true);
    writeLobbyGuest(bits, guest);
  }
  for (const bot of state.bots) {
    bits.writeBool(true);
    writeLobbyBot(bits, bot);
  }
  bits.writeBool(false);
  if (options.includeHeroUpdate) {
    writePlayerHeroUpdates(bits, state);
  } else {
    writeEmptyList(bits);
  }
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
  while (bits.readBool()) {
    bits.readBool();
    bits.readPackedU32();
    bits.readString();
    bits.readString();
    bits.readPackedU32();
    bits.readPackedU32();
    bits.readPackedU32();
    bits.readPackedU32();
    bits.readPackedU32();
    bits.readBool();
    bits.readBool();
    bits.readBool();
    bits.readPackedU32();
    for (let i = 0; i < 6; i++) bits.readPackedU32();
    for (let i = 0; i < 8; i++) bits.readPackedU32();
    bits.readPackedU24();
    bits.readPackedU24();
    bits.readBool();
    bits.readPackedU24();
    bits.readPackedU32();
    bits.readPackedU24();
    bits.readPackedU24();
    bits.readPackedU32();
    bits.readPackedU32();
    bits.readString();
  }
  while (bits.readBool()) {
    bits.readPackedU32();
    if (bits.readBool()) {
      bits.readBool();
      bits.readPackedU32();
      bits.readString();
      bits.readString();
      bits.readPackedU32();
      bits.readPackedU32();
      bits.readPackedU32();
      bits.readPackedU32();
      bits.readPackedU32();
      bits.readBool();
      bits.readBool();
      bits.readBool();
      bits.readPackedU32();
      for (let i = 0; i < 6; i++) bits.readPackedU32();
      for (let i = 0; i < 8; i++) bits.readPackedU32();
      bits.readPackedU24();
      bits.readPackedU24();
      bits.readBool();
      bits.readPackedU24();
      bits.readPackedU32();
      bits.readPackedU24();
      bits.readPackedU24();
      bits.readPackedU32();
      bits.readPackedU32();
      bits.readString();
    } else {
      bits.readPackedU32();
      bits.readPackedU32();
    }
  }
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

/**
 * 2449 human branch (method_6848) — same player body as writeHost/writeLobbyGuest
 * (empty hero slots). Trailing bool false keeps class_112 bindings when var_486=2.
 * Hero assignment for the guest is expected from a follow-up 2445 (method_2849),
 * matching how the host gets a selectable legend on room create.
 */
export const encodeLocalGuestJoin = (guest: LobbyState["guests"][number]): Uint8Array => {
  const bits = new BitWriter();
  bits.writeBool(false);
  bits.writePackedU32(STUB_USER_ID);
  bits.writeString(STUB_DISPLAY_NAME);
  bits.writeString("");
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writeString("");
  bits.writePackedU32(guest.localIndex);
  bits.writePackedU32(guest.controller);
  bits.writePackedU32(guest.heroId);
  bits.writePackedU32(guest.costumeId);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU24(0);
  bits.writePackedU32(0);
  bits.writePackedU24(0);
  bits.writeBool(false);
  bits.writePackedU32(0);
  bits.writeBool(false);
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

/** LinkUpdater.method_7414 — packed room id + two bools. */
export type JoinCustomRoom = {
  readonly roomId: number;
  readonly fromInvite: boolean;
  readonly spectateOrFlag: boolean;
};

export const decodeJoinCustomRoom = (payload: Uint8Array): JoinCustomRoom => {
  const bits = new BitReader(payload);
  return {
    roomId: bits.readPackedU32(),
    fromInvite: bits.readBool(),
    spectateOrFlag: bits.readBool(),
  };
};

export const lobbySettingsFrame = (state: LobbyState): TcpFrame => ({
  type: PacketType.lobbySettings,
  seq: undefined,
  payload: encodeLobbySettings(state),
});

export const customLobbyFrame = (
  state: LobbyState,
  options?: {
    readonly roomId?: number;
    readonly includeHeroUpdate?: boolean;
    readonly includeHeroSlots?: boolean;
  },
): TcpFrame => ({
  type: PacketType.customLobby,
  seq: undefined,
  payload: encodeCustomLobby(state, options),
});

export const lobbyJoinFrame = (controller = BOT_CONTROLLER): TcpFrame => ({
  type: PacketType.lobbyJoin,
  seq: undefined,
  payload: encodeAddBot(controller),
});

export const lobbyGuestJoinFrame = (guest: LobbyState["guests"][number]): TcpFrame => ({
  type: PacketType.lobbyJoin,
  seq: undefined,
  payload: encodeLocalGuestJoin(guest),
});

/** LinkUpdater.method_7553 — packed userId + bool (false = self actually left). */
export const spectateLeaveSelfFrame = (userId = STUB_USER_ID): TcpFrame => {
  const bits = new BitWriter();
  bits.writePackedU32(userId);
  bits.writeBool(false);
  return { type: PacketType.recvSpectateLeave, seq: undefined, payload: bits.toUint8Array() };
};

/** LinkUpdater.method_5357 — bool bot, else packed userId + packed controller + silent. */
export const recvLeaveFrame = (userId: number, controller: number): TcpFrame => {
  const bits = new BitWriter();
  bits.writeBool(false);
  bits.writePackedU32(userId);
  bits.writePackedU32(controller);
  bits.writeBool(true);
  return { type: PacketType.recvLeave, seq: undefined, payload: bits.toUint8Array() };
};
