import { describe, expect, it } from "@effect/vitest";
import { Bitstream } from "./bitstream.ts";

describe("Bitstream", () => {
  it("packs 4-bit values MSB-first into one byte", () => {
    const w = new Bitstream();
    w.writeBits(4, 3);
    w.writeBits(4, 2);
    expect([...w.toUint8Array()]).toEqual([0x32]);
    const r = new Bitstream(w.toUint8Array());
    expect(r.readBits(4)).toBe(3);
    expect(r.readBits(4)).toBe(2);
  });

  it("round-trips u32, u16, and string from a byte-aligned start", () => {
    const w = new Bitstream();
    w.writeU32(268);
    w.writeU16(3);
    w.writeString("hi");
    const r = new Bitstream(w.toUint8Array());
    expect(r.readU32()).toBe(268);
    expect(r.readU16()).toBe(3);
    expect(r.readString()).toBe("hi");
  });

  it("throws EOF on unaligned readU32 when next byte is missing", () => {
    const w = new Bitstream();
    w.writeBits(4, 1);
    expect(w.toUint8Array().length).toBe(1);
    const r = new Bitstream(w.toUint8Array());
    expect(r.readBits(4)).toBe(1);
    expect(() => r.readU32()).toThrow(RangeError);
  });

  it("round-trips u32 after a 4-bit write (unaligned)", () => {
    const w = new Bitstream();
    w.writeBits(4, 4);
    w.writeU32(0xaabbccdd);
    const r = new Bitstream(w.toUint8Array());
    expect(r.readBits(4)).toBe(4);
    expect(r.readU32()).toBe(0xaabbccdd);
  });
});
