import { describe, expect, it } from "@effect/vitest";
import { encodeGameConnect } from "./game-connect.ts";
import { protocolActionFor } from "./game-child-protocol.ts";
import { decodeMatchSetup } from "./match-setup.ts";
import { PacketType } from "./packets.ts";

const spec = { userId: 1, token: "gimped", includeBot: false };

describe("game child protocol", () => {
  it("answers valid 10405 with 10310", () => {
    const action = protocolActionFor(
      {
        type: PacketType.gameConnect,
        seq: undefined,
        payload: encodeGameConnect({ userId: 1, token: "gimped" }),
      },
      spec,
    );
    expect(action._tag).toBe("Reply");
    if (action._tag !== "Reply") return;
    expect(action.frames).toHaveLength(1);
    expect(action.frames[0]?.type).toBe(PacketType.matchSetup);
    expect(decodeMatchSetup(action.frames[0]!.payload).hostUserId).toBe(1);
  });

  it("closes on token mismatch", () => {
    expect(
      protocolActionFor(
        {
          type: PacketType.gameConnect,
          seq: undefined,
          payload: encodeGameConnect({ userId: 1, token: "nope" }),
        },
        spec,
      ),
    ).toEqual({ _tag: "Close" });
  });

  it("echoes keepalive 12100", () => {
    expect(
      protocolActionFor(
        { type: PacketType.keepalivePing, seq: undefined, payload: new Uint8Array() },
        spec,
      ),
    ).toEqual({
      _tag: "Reply",
      frames: [{ type: PacketType.keepalivePing, seq: undefined, payload: new Uint8Array() }],
    });
  });

  it("does not send loginChallenge 12000 after clientVersion", () => {
    const action = protocolActionFor(
      { type: PacketType.clientVersion, seq: 0, payload: new Uint8Array() },
      spec,
    );
    expect(action).toEqual({ _tag: "Reply", frames: [] });
  });
});
