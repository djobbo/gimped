import { describe, expect, it } from "@effect/vitest";
import { encodeGameConnect } from "./game-connect.ts";
import { gameActionFor } from "./game-replies.ts";
import { decodeMatchSetup } from "./match-setup.ts";
import { PacketType } from "./packets.ts";

const spec = { userId: 1, token: "gimped", includeBot: false };

describe("game replies", () => {
  it("answers valid 10405 with 10310 and sync sequence", () => {
    const action = gameActionFor(
      {
        type: PacketType.gameConnect,
        seq: undefined,
        payload: encodeGameConnect({ userId: 1, token: "gimped" }),
      },
      spec,
    );
    expect(action._tag).toBe("Reply");
    if (action._tag !== "Reply") return;
    expect(action.frames.map((frame) => frame.type)).toEqual([
      PacketType.matchSetup,
      PacketType.sessionSync,
      PacketType.entitySpawn,
      PacketType.gameServerReady,
    ]);
    expect(decodeMatchSetup(action.frames[0]!.payload).hostUserId).toBe(1);
  });

  it("closes on token mismatch", () => {
    expect(
      gameActionFor(
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
      gameActionFor(
        { type: PacketType.keepalivePing, seq: undefined, payload: new Uint8Array() },
        spec,
      ),
    ).toEqual({
      _tag: "Reply",
      frames: [{ type: PacketType.keepalivePing, seq: undefined, payload: new Uint8Array() }],
    });
  });

  it("does not send loginChallenge 12000 after clientVersion", () => {
    const action = gameActionFor(
      { type: PacketType.clientVersion, seq: 0, payload: new Uint8Array() },
      spec,
    );
    expect(action).toEqual({ _tag: "Reply", frames: [] });
  });
});
