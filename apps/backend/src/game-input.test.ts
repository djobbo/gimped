import { describe, expect, it } from "@effect/vitest";
import { BitWriter } from "./bitstream.ts";
import { decodeGameInput } from "./game-input.ts";
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
      x: 1200,
      y: 300,
      raw: writer.toUint8Array(),
    });
  });

  it("returns undefined for unrelated packet types", () => {
    expect(decodeGameInput(PacketType.keepalivePing, new Uint8Array())).toBeUndefined();
  });
});
