import { describe, expect, it } from "@effect/vitest";
import { encodeFrame, FrameDecoder, toHex } from "./framing.ts";

describe("TCP framing", () => {
  it("round-trips a packet without a sequence (class_85 type bit 32768 clear)", () => {
    const payload = new TextEncoder().encode("hello");
    const bytes = encodeFrame({ type: 178, seq: undefined, payload });
    expect(bytes[0]).toBe(0);
    expect(bytes[1]).toBe(178);
    const decoder = new FrameDecoder();
    expect(decoder.push(bytes)).toEqual([{ type: 178, seq: undefined, payload }]);
  });

  it("round-trips a packet with a sequence (class_85 type bit 32768 set)", () => {
    const payload = Uint8Array.from([1, 2, 3]);
    const bytes = encodeFrame({ type: 30, seq: 9, payload });
    expect(bytes[0]).toBe(0x80);
    expect(bytes[1]).toBe(30);
    const decoder = new FrameDecoder();
    expect(decoder.push(bytes)).toEqual([{ type: 30, seq: 9, payload }]);
  });

  it("buffers incomplete frames across pushes", () => {
    const payload = Uint8Array.from([9]);
    const bytes = encodeFrame({ type: 16, seq: undefined, payload });
    const decoder = new FrameDecoder();
    expect(decoder.push(bytes.subarray(0, 2))).toEqual([]);
    expect(decoder.push(bytes.subarray(2))).toEqual([{ type: 16, seq: undefined, payload }]);
  });

  it("encodes payload hex", () => {
    expect(toHex(Uint8Array.from([0x0a, 0xb0]))).toBe("0ab0");
  });
});
