import { describe, expect, it } from "@effect/vitest";
import { encodeGameConnect } from "./game-connect.ts";
import { protocolActionFor, protocolIngest } from "./game-child-protocol.ts";
import { BitWriter } from "./bitstream.ts";
import { decodeMatchSetup } from "./match-setup.ts";
import { PacketType } from "./packets.ts";

import { MatchSetupSpec } from "./match-spec.ts";

const spec = { userId: 1, token: "gimped", includeBot: false, setup: MatchSetupSpec.default };
const syncingState = {
  phase: "syncingIntoMatch" as const,
  includeBot: false,
  connected: true,
  tick: 0,
  clientTick: 0,
  clientSimTick: 0,
  simReady: false,
  entities: [],
  entityInputs: {},
  inputQueue: [],
  udpAckSeq: 0,
  udpSendSeq: 0,
  udpSessionId: 0,
  lastIntroSyncAtMs: 0,
  lastTickAdvanceAtMs: 0,
  enteredActiveMatchAtMs: 0,
};

describe("game child protocol", () => {
  it("answers valid 10405 with 10310 only", () => {
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
    expect(result.action.frames.map((frame) => frame.type)).toEqual([PacketType.matchSetup]);
    expect(decodeMatchSetup(result.action.frames[0]!.payload).hostUserId).toBe(1);
  });

  it("answers 10409 levelReady with sync sequence and advances phase", () => {
    const result = protocolIngest(
      { type: PacketType.levelReady, seq: undefined, payload: new Uint8Array() },
      spec,
      syncingState,
    );
    expect(result.nextPhase).toBe("activeMatch");
    expect(result.action._tag).toBe("Reply");
    if (result.action._tag !== "Reply") return;
    expect(result.action.frames.map((frame) => frame.type)).toEqual([PacketType.gameServerReady]);
  });

  it("answers 10403 with the same level-ready sync sequence", () => {
    const result = protocolIngest(
      { type: PacketType.postConnectAck, seq: undefined, payload: new Uint8Array() },
      spec,
      syncingState,
    );
    expect(result.nextPhase).toBe("activeMatch");
    expect(result.action._tag).toBe("Reply");
    if (result.action._tag !== "Reply") return;
    expect(result.action.frames.map((frame) => frame.type)).toEqual([PacketType.gameServerReady]);
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

  it("acks intro sync packets during activeMatch without unknown logging", () => {
    const result = protocolIngest(
      { type: PacketType.introEntitySync, seq: undefined, payload: new Uint8Array(13) },
      spec,
      { ...syncingState, phase: "activeMatch" },
    );
    expect(result.introSync).toBe(true);
    expect(result.unknownGameplay).toBeUndefined();
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

  it("acks 10403 postConnectAck during activeMatch without unknown logging", () => {
    const result = protocolIngest(
      { type: PacketType.postConnectAck, seq: undefined, payload: new Uint8Array() },
      spec,
      { ...syncingState, phase: "activeMatch" },
    );
    expect(result.unknownGameplay).toBeUndefined();
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
