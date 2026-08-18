import { describe, expect, it } from "@effect/vitest";
import { BitReader } from "./bitstream.ts";
import {
  decodeAddBot,
  decodeCustomLobby,
  decodeLobbySettings,
  STUB_ROOM_CODE,
} from "./custom-lobby.ts";
import { decodePayload } from "./decode.ts";
import { STUB_USER_ID } from "./login-accepted.ts";
import { PacketType } from "./packets.ts";
import { LOGIN_CHALLENGE, repliesFor } from "./replies.ts";

describe("stub replies", () => {
  it("sends login challenge 12000 after clientVersion (LinkUpdater.method_6530)", () => {
    const replies = repliesFor({
      type: PacketType.clientVersion,
      seq: 0,
      payload: new Uint8Array(),
    });
    expect(replies).toHaveLength(1);
    expect(replies[0]?.type).toBe(PacketType.loginChallenge);
    expect(replies[0]?.seq).toBeUndefined();
    expect(new BitReader(replies[0]!.payload).readString()).toBe(LOGIN_CHALLENGE);
  });

  it("echoes empty keepalive 12100 (LinkUpdater.method_3630)", () => {
    expect(
      repliesFor({ type: PacketType.keepalivePing, seq: undefined, payload: new Uint8Array() }),
    ).toEqual([{ type: PacketType.keepalivePing, seq: undefined, payload: new Uint8Array() }]);
  });

  it("sends loginAccepted 2431 after loginRequest (LinkUpdater.method_8795)", () => {
    const replies = repliesFor({
      type: PacketType.loginRequest,
      seq: 0,
      payload: new Uint8Array(),
    });
    expect(replies).toHaveLength(1);
    expect(replies[0]?.type).toBe(PacketType.loginAccepted);
    expect(replies[0]?.seq).toBeUndefined();
    expect(decodePayload(PacketType.loginAccepted, replies[0]!.payload)).toEqual({
      _tag: "LoginAccepted",
      userId: 1,
      displayName: "Gimped",
    });
  });

  it("sends customLobby 2445 after createCustomRoom (LinkUpdater.method_4037)", () => {
    const replies = repliesFor({
      type: PacketType.createCustomRoom,
      seq: 0,
      payload: Uint8Array.from([0x1e, 0x00, 0x10, 0x20]),
    });
    expect(replies).toHaveLength(1);
    expect(replies[0]?.type).toBe(PacketType.customLobby);
    expect(replies[0]?.seq).toBeUndefined();
    expect(decodeCustomLobby(replies[0]!.payload)).toEqual({
      _tag: "CustomLobby",
      roomId: 1,
      roomCode: STUB_ROOM_CODE,
      hostUserId: STUB_USER_ID,
      regionId: 2,
      maxPlayers: 4,
    });
  });

  it("acks updateSettings 37 with lobbySettings 2448 (LinkUpdater.method_8229)", () => {
    const payload = Uint8Array.from(
      Buffer.from("001100287680000806c86c8084080000000000223a4a698800", "hex"),
    );
    const replies = repliesFor({ type: PacketType.updateSettings, seq: 0, payload });
    expect(replies).toHaveLength(1);
    expect(replies[0]?.type).toBe(PacketType.lobbySettings);
    expect(decodeLobbySettings(replies[0]!.payload).maxPlayers).toBe(2);
  });

  it("acks addBot 44 with lobbyJoin 2449 (LinkUpdater.method_5838)", () => {
    const replies = repliesFor({
      type: PacketType.addBot,
      seq: 0,
      payload: Uint8Array.from([0x8a, 0x80]),
    });
    expect(replies).toHaveLength(1);
    expect(replies[0]?.type).toBe(PacketType.lobbyJoin);
    expect(decodeAddBot(replies[0]!.payload)).toEqual({ _tag: "AddBot", controller: 5 });
  });

  it("does not reply to protocolHello", () => {
    expect(
      repliesFor({ type: PacketType.protocolHello, seq: undefined, payload: new Uint8Array() }),
    ).toEqual([]);
  });
});
