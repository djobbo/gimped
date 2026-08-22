import { describe, expect, it } from "@effect/vitest";
import { BitWriter } from "./bitstream.ts";
import {
  encodeCustomLobby,
  STUB_MAX_PLAYERS,
  STUB_REGION_ID,
  STUB_ROOM_CODE,
} from "./custom-lobby.ts";
import { decodePayload } from "./decode.ts";
import { encodeLoginAccepted, STUB_DISPLAY_NAME, STUB_USER_ID } from "./login-accepted.ts";
import { PacketType } from "./packets.ts";

describe("payload decode", () => {
  it("decodes the protocol hello string from class_139.method_7603", () => {
    const writer = new BitWriter();
    writer.writeString("Brawlhalla client to server protocol 1.0");
    expect(decodePayload(PacketType.protocolHello, writer.toUint8Array())).toEqual({
      _tag: "ProtocolHello",
      text: "Brawlhalla client to server protocol 1.0",
    });
  });

  it("decodes client version packed uints from class_139.method_7603", () => {
    const writer = new BitWriter();
    writer.writePackedU32(1009000000);
    writer.writePackedU32(1);
    expect(decodePayload(PacketType.clientVersion, writer.toUint8Array())).toEqual({
      _tag: "ClientVersion",
      versionStamp: 1009000000,
      platformId: 1,
    });
  });

  it("decodes a Steam login request without keeping ticket bytes", () => {
    const writer = new BitWriter();
    writer.writeString("");
    writer.writeString("");
    writer.writeString("");
    writer.writeString("uwu");
    writer.writePackedU32(3);
    writer.writeBytes(Uint8Array.from([1, 2, 3]));
    writer.writeString("");
    writer.writeU8(1);
    writer.writePackedU32(24);
    writer.writeString("deadbeef");
    expect(decodePayload(PacketType.loginRequest, writer.toUint8Array())).toEqual({
      _tag: "LoginRequest",
      email: "",
      ticketBytes: 3,
      nameHint: "",
    });
  });

  it("round-trips the stub loginAccepted payload (LinkUpdater.method_8795)", () => {
    expect(decodePayload(PacketType.loginAccepted, encodeLoginAccepted())).toEqual({
      _tag: "LoginAccepted",
      userId: STUB_USER_ID,
      displayName: STUB_DISPLAY_NAME,
    });
  });

  it("decodes createCustomRoom flags from LinkUpdater.method_944", () => {
    expect(
      decodePayload(PacketType.createCustomRoom, Uint8Array.from([0x1e, 0x00, 0x10, 0x20])),
    ).toEqual({
      _tag: "CreateCustomRoom",
      flags: 14,
      playlistId: 0,
      customGameType: 1,
    });
  });

  it("round-trips the stub customLobby payload (LinkUpdater.method_4037)", () => {
    expect(decodePayload(PacketType.customLobby, encodeCustomLobby())).toEqual({
      _tag: "CustomLobby",
      roomId: 1,
      roomCode: STUB_ROOM_CODE,
      hostUserId: STUB_USER_ID,
      regionId: STUB_REGION_ID,
      maxPlayers: STUB_MAX_PLAYERS,
    });
  });

  it("decodes empty startMatch from class_104.method_8137", () => {
    expect(decodePayload(PacketType.startMatch, new Uint8Array())).toEqual({ _tag: "StartMatch" });
  });

  it("returns Unknown for other types", () => {
    expect(decodePayload(16, Uint8Array.from([1]))).toEqual({ _tag: "Unknown" });
  });
});
