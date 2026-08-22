import { describe, expect, it } from "@effect/vitest";
import { BitReader, BitWriter } from "./bitstream.ts";

describe("bitstream", () => {
  it("round-trips a protocol string the way class_30.method_361 writes it", () => {
    const writer = new BitWriter();
    writer.writeString("Brawlhalla client to server protocol 1.0");
    const reader = new BitReader(writer.toUint8Array());
    expect(reader.readString()).toBe("Brawlhalla client to server protocol 1.0");
  });

  it("round-trips packed uints with 3-bit and 4-bit prefixes", () => {
    const writer = new BitWriter();
    writer.writePackedU32(0);
    writer.writePackedU32(1);
    writer.writePackedU32(1009000000);
    writer.writePackedU32(7);
    writer.writePackedU24(0);
    writer.writePackedU24(1);
    writer.writeBool(true);
    writer.writeU8(7);
    const reader = new BitReader(writer.toUint8Array());
    expect(reader.readPackedU32()).toBe(0);
    expect(reader.readPackedU32()).toBe(1);
    expect(reader.readPackedU32()).toBe(1009000000);
    expect(reader.readPackedU32()).toBe(7);
    expect(reader.readPackedU24()).toBe(0);
    expect(reader.readPackedU24()).toBe(1);
    expect(reader.readBool()).toBe(true);
    expect(reader.readU8()).toBe(7);
  });

  it("throws RangeError on EOF", () => {
    const reader = new BitReader(new Uint8Array([0xff]));
    expect(reader.readBits(8)).toBe(0xff);
    expect(() => reader.readBits(1)).toThrow(RangeError);
  });
});
