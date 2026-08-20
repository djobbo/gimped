import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { DecodedPayload, ProtocolHello, TcpFrame } from "./messages.ts";

describe("message schemas", () => {
  it("accepts a TcpFrame-shaped value", () => {
    const frame: typeof TcpFrame.Type = {
      type: 178,
      seq: undefined,
      payload: new Uint8Array([1]),
    };
    expect(frame.type).toBe(178);
  });

  it("round-trips a DecodedPayload tagged struct via Schema (not used on hot path)", () => {
    const hello = ProtocolHello.make({ text: "Brawlhalla client to server protocol 1.0" });
    const encoded = Schema.encodeUnknownSync(DecodedPayload)(hello);
    expect(Schema.decodeUnknownSync(DecodedPayload)(encoded)).toEqual(hello);
  });
});
