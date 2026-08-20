import { describe, expect, it } from "@effect/vitest";
import { BitReader } from "./bitstream.ts";
import { LOGIN_CHALLENGE, handleFrame, repliesFor } from "./replies.ts";
import { PacketType } from "./packets.ts";

describe("stub replies (login)", () => {
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
  });

  it("ignores lobby packets in the login-only handler", () => {
    expect(
      handleFrame({ type: PacketType.createCustomRoom, seq: 0, payload: new Uint8Array() }),
    ).toEqual({ replies: [] });
  });
});
