import { describe, expect, it } from "@effect/vitest";
import { BitWriter } from "./bitstream.ts";
import { initialGameChildState } from "./game-child-model.ts";
import {
  decodeGameInput,
  drainAppliedInputs,
  encodeInputBroadcast,
  relayInputSamples,
  queueMoveInput,
  syncStateToInputTick,
  buildFightStartSync,
} from "./game-input.ts";
import { PacketType } from "./packets.ts";

describe("game input", () => {
  it("decodes empty 10401 simReady", () => {
    expect(decodeGameInput(PacketType.simReady, new Uint8Array())).toEqual({
      _tag: "SimReady",
    });
  });

  it("decodes 10404 tickAck with a packed client tick", () => {
    const writer = new BitWriter();
    writer.writePackedU32(42);
    expect(decodeGameInput(PacketType.tickAck, writer.toUint8Array())).toEqual({
      _tag: "TickAck",
      clientTick: 42,
    });
  });

  it("decodes 10407 move input from class_288.method_2934 shape", () => {
    const writer = new BitWriter();
    writer.writeBits(4, 1);
    writer.writePackedU32(1200);
    writer.writeBits(14, 300);
    expect(decodeGameInput(PacketType.moveInput, writer.toUint8Array())).toEqual({
      _tag: "Move",
      entityId: 1,
      tick: 1200,
      input: 300,
      raw: writer.toUint8Array(),
    });
  });

  it("returns undefined for unrelated packet types", () => {
    expect(decodeGameInput(PacketType.keepalivePing, new Uint8Array())).toBeUndefined();
  });

  it("relayInputSamples includes local guest entity ids from roster", () => {
    const state = {
      ...initialGameChildState(false, { guests: [{ entityId: 2 }] }),
      tick: 6800,
      clientSimTick: 6800,
      entityInputs: { 2: { tick: 6800, input: 16 } },
    };
    expect(relayInputSamples(state)).toEqual([
      { entityId: 1, tick: 6800, input: 0 },
      { entityId: 2, tick: 6800, input: 16 },
    ]);
  });

  it("relayInputSamples uses exact tick match from queue", () => {
    const state = {
      ...initialGameChildState(true),
      tick: 6800,
      clientSimTick: 6800,
      inputQueue: [{ entityId: 1, tick: 6800, input: 4 }],
    };
    expect(relayInputSamples(state)).toEqual([
      { entityId: 1, tick: 6800, input: 4 },
      { entityId: 2, tick: 6800, input: 0 },
    ]);
  });

  it("relayInputSamples holds latest mask when no exact sample for this tick", () => {
    const state = {
      ...initialGameChildState(true),
      tick: 6448,
      clientSimTick: 6800,
      inputQueue: [],
      entityInputs: { 1: { tick: 6432, input: 4 } },
    };
    expect(relayInputSamples(state)).toEqual([
      { entityId: 1, tick: 6448, input: 4 },
      { entityId: 2, tick: 6448, input: 0 },
    ]);
  });

  it("relayInputSamples does not hold future samples onto earlier ticks", () => {
    const state = {
      ...initialGameChildState(true),
      tick: 6432,
      clientSimTick: 6800,
      inputQueue: [{ entityId: 1, tick: 6800, input: 4 }],
      entityInputs: { 1: { tick: 6800, input: 4 } },
    };
    expect(relayInputSamples(state)).toEqual([
      { entityId: 1, tick: 6432, input: 0 },
      { entityId: 2, tick: 6432, input: 0 },
    ]);
  });

  it("syncStateToInputTick snaps server tick to client input frame", () => {
    const state = {
      ...initialGameChildState(true),
      tick: 6352,
      clientSimTick: 6800,
      simReady: true,
      inputQueue: [{ entityId: 1, tick: 6800, input: 4 }],
    };
    const sync = syncStateToInputTick(state, 6800);
    expect(sync.state.tick).toBe(6800);
    expect(sync.frames.map((frame) => frame.type)).toEqual([
      PacketType.tickPulse,
      PacketType.inputBroadcast,
    ]);
  });

  it("queueMoveInput stores neutral samples for release frames", () => {
    const state = initialGameChildState(false);
    const next = queueMoveInput(state, { entityId: 1, tick: 32, input: 0 });
    expect(next.inputQueue).toEqual([{ entityId: 1, tick: 32, input: 0 }]);
  });

  it("drainAppliedInputs keeps future inputs until server tick passes them", () => {
    const state = {
      ...initialGameChildState(false),
      tick: 7040,
      inputQueue: [
        { entityId: 1, tick: 7040, input: 260 },
        { entityId: 1, tick: 8912, input: 4 },
      ],
    };
    expect(drainAppliedInputs(state).inputQueue).toEqual([{ entityId: 1, tick: 8912, input: 4 }]);
  });

  it("encodes 10309 input broadcast with entity samples", () => {
    const payload = encodeInputBroadcast({
      serverTick: 16,
      inputs: [
        { entityId: 1, tick: 16, input: 42 },
        { entityId: 2, tick: 16, input: 0 },
      ],
    });
    expect(payload.length).toBeGreaterThan(0);
  });

  it("buildFightStartSync sends 10404 only (other bootstrap stays separate)", () => {
    const state = { ...initialGameChildState(false), clientSimTick: 6336 };
    const frames = buildFightStartSync(state);
    expect(frames.map((frame) => frame.type)).toEqual([PacketType.tickAck]);
  });
});
