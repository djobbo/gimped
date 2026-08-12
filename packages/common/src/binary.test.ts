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
});
