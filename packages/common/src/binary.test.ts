import { describe, expect, it } from "vite-plus/test";
import { ByteReader, ByteWriter } from "./binary.ts";

describe("ByteReader / ByteWriter", () => {
  it("round-trips u8, u16BE, and u32BE", () => {
    const writer = new ByteWriter();
    writer.writeU8(0xab);
    writer.writeU16BE(0x1234);
    writer.writeU32BE(0xdeadbeef);
    const bytes = writer.toUint8Array();
    expect([...bytes]).toEqual([0xab, 0x12, 0x34, 0xde, 0xad, 0xbe, 0xef]);

    const reader = new ByteReader(bytes);
    expect(reader.readU8()).toBe(0xab);
    expect(reader.readU16BE()).toBe(0x1234);
    expect(reader.readU32BE()).toBe(0xdeadbeef);
    expect(reader.remaining).toBe(0);
  });

  it("throws RangeError on EOF", () => {
    const reader = new ByteReader(new Uint8Array([1]));
    expect(reader.readU8()).toBe(1);
    expect(() => reader.readU8()).toThrow(RangeError);
  });

  it("round-trips little-endian ints, signed, floats, bool, and UTF", () => {
    const writer = new ByteWriter();
    writer.writeU16LE(0x1234);
    writer.writeU32LE(0xdeadbeef);
    writer.writeI8(-1);
    writer.writeI16LE(-2);
    writer.writeF32LE(1.5);
    writer.writeF64LE(-2.5);
    writer.writeBool(true);
    writer.writeBool(false);
    writer.writeUTFLE("hi");
    writer.writeBytes(Uint8Array.from([9, 8]));

    const bytes = writer.toUint8Array();
    const f32 = new DataView(new ArrayBuffer(4));
    f32.setFloat32(0, 1.5, true);
    const f64 = new DataView(new ArrayBuffer(8));
    f64.setFloat64(0, -2.5, true);
    expect([...bytes.slice(0, 2)]).toEqual([0x34, 0x12]);
    expect([...bytes.slice(2, 6)]).toEqual([0xef, 0xbe, 0xad, 0xde]);
    expect(bytes[6]).toBe(0xff);
    expect([...bytes.slice(7, 9)]).toEqual([0xfe, 0xff]);
    expect([...bytes.slice(9, 13)]).toEqual([...new Uint8Array(f32.buffer)]);
    expect([...bytes.slice(13, 21)]).toEqual([...new Uint8Array(f64.buffer)]);
    expect(bytes[21]).toBe(1);
    expect(bytes[22]).toBe(0);
    expect([...bytes.slice(23, 27)]).toEqual([2, 0, 0x68, 0x69]);
    expect([...bytes.slice(27)]).toEqual([9, 8]);

    const reader = new ByteReader(bytes);
    expect(reader.readU16LE()).toBe(0x1234);
    expect(reader.readU32LE()).toBe(0xdeadbeef);
    expect(reader.readI8()).toBe(-1);
    expect(reader.readI16LE()).toBe(-2);
    expect(reader.readF32LE()).toBe(1.5);
    expect(reader.readF64LE()).toBe(-2.5);
    expect(reader.readBool()).toBe(true);
    expect(reader.readBool()).toBe(false);
    expect(reader.readUTFLE()).toBe("hi");
    expect([...reader.readBytes(2)]).toEqual([9, 8]);
    expect(reader.remaining).toBe(0);
    expect(reader.offset).toBe(bytes.length);
  });

  it("throws RangeError when UTFLE payload exceeds 65535 bytes", () => {
    const writer = new ByteWriter();
    expect(() => writer.writeUTFLE("a".repeat(65536))).toThrow(RangeError);
  });
});
