import { describe, expect, it } from "@effect/vitest";
import { BitReader, BitWriter } from "./bitstream.ts";
import {
  BOT_CONTROLLER,
  decodeAddBot,
  decodeCustomLobby,
  decodeLobbySettings,
  encodeAddBot,
  encodeCustomLobby,
  settingsAckFromClient,
  STUB_MAX_PLAYERS,
  STUB_REGION_ID,
  STUB_ROOM_CODE,
} from "./custom-lobby.ts";
import { STUB_USER_ID } from "./login-accepted.ts";

/** LinkUpdater.method_875 layout: method_5878 fields plus a room-code string. */
const encodeUpdateSettings = (maxPlayers: number, regionId: number): Uint8Array => {
  const bits = new BitWriter();
  bits.writePackedU32(0);
  bits.writePackedU32(1);
  bits.writePackedU24(maxPlayers);
  bits.writePackedU32(0);
  bits.writePackedU32(maxPlayers);
  bits.writePackedU32(180);
  for (let i = 0; i < 12; i++) bits.writePackedU32(i === 3 ? 1 : 0);
  bits.writePackedU32(0);
  bits.writeU8(regionId);
  bits.writeString(STUB_ROOM_CODE);
  bits.writePackedU24(0);
  bits.writeBool(false);
  bits.writeBool(false);
  return bits.toUint8Array();
};

describe("custom lobby codecs", () => {
  it("encodes Atlanta region 2 and max players 4 so class_104.method_6165 is not 0", () => {
    expect(decodeCustomLobby(encodeCustomLobby())).toEqual({
      _tag: "CustomLobby",
      roomId: 1,
      roomCode: STUB_ROOM_CODE,
      hostUserId: STUB_USER_ID,
      regionId: STUB_REGION_ID,
      maxPlayers: STUB_MAX_PLAYERS,
    });
  });

  it("strips the method_875 room-code string into a method_5878 settings ack", () => {
    const ack = settingsAckFromClient(encodeUpdateSettings(6, STUB_REGION_ID));
    expect(decodeLobbySettings(ack)).toEqual({
      _tag: "LobbySettings",
      playlistId: 0,
      customGameType: 1,
      maxPlayers: 6,
      regionId: STUB_REGION_ID,
    });
  });

  it("encodes method_5838 bot-add (first bool true + controller 5)", () => {
    expect(decodeAddBot(encodeAddBot())).toEqual({
      _tag: "AddBot",
      controller: BOT_CONTROLLER,
    });
    const captured = new BitReader(Uint8Array.from([0x8a, 0x80]));
    expect(captured.readBool()).toBe(true);
    expect(captured.readPackedU32()).toBe(BOT_CONTROLLER);
  });
});
