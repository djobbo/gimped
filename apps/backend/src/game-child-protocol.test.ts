import { describe, expect, it } from "@effect/vitest";
import { encodeGameConnect } from "./game-connect.ts";
import { protocolActionFor, protocolIngest } from "./game-child-protocol.ts";
import { BitWriter } from "./bitstream.ts";
import { decodeMatchSetup } from "./match-setup.ts";
import { PacketType } from "./packets.ts";

const spec = { userId: 1, token: "gimped", includeBot: false };
const syncingState = {
  phase: "syncingIntoMatch" as const,
  includeBot: false,
  connected: true,
  tick: 0,
  clientTick: 0,
  simReady: false,
  entities: [],
};

describe("game child protocol", () => {
  it("answers valid 10405 with 10310 and post-10310 sync sequence", () => {
    const result = protocolIngest(
      {
        type: PacketType.gameConnect,
        seq: undefined,
        payload: encodeGameConnect({ userId: 1, token: "gimped" }),
      },
      spec,
      syncingState,
    );
    expect(result.action._tag).toBe("Reply");
    if (result.action._tag !== "Reply") return;
    expect(result.action.frames.map((frame) => frame.type)).toEqual([
      PacketType.matchSetup,
      PacketType.sessionSync,
      PacketType.entitySpawn,
      PacketType.gameServerReady,
    ]);
    expect(decodeMatchSetup(result.action.frames[0]!.payload).hostUserId).toBe(1);
  });

  it("closes on token mismatch", () => {
    expect(
      protocolIngest(
        {
          type: PacketType.gameConnect,
          seq: undefined,
          payload: encodeGameConnect({ userId: 1, token: "nope" }),
        },
        spec,
        syncingState,
      ).action,
    ).toEqual({ _tag: "Close" });
  });

  it("advances to activeMatch on 10403 during syncingIntoMatch", () => {
    const result = protocolIngest(
      { type: PacketType.postConnectAck, seq: undefined, payload: new Uint8Array() },
      spec,
      syncingState,
    );
    expect(result.nextPhase).toBe("activeMatch");
    expect(result.action).toEqual({ _tag: "Reply", frames: [] });
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

  it("routes 10401 simReady to gameplay input during activeMatch", () => {
    const result = protocolIngest(
      { type: PacketType.simReady, seq: undefined, payload: new Uint8Array() },
      spec,
      { ...syncingState, phase: "activeMatch" },
    );
    expect(result.input).toEqual({ _tag: "SimReady" });
    expect(result.action).toEqual({ _tag: "Reply", frames: [] });
  });

  it("routes 10404 tickAck to gameplay input during activeMatch", () => {
    const writer = new BitWriter();
    writer.writePackedU32(7);
    const result = protocolIngest(
      { type: PacketType.tickAck, seq: undefined, payload: writer.toUint8Array() },
      spec,
      { ...syncingState, phase: "activeMatch" },
    );
    expect(result.input).toEqual({ _tag: "TickAck", clientTick: 7 });
  });
});
