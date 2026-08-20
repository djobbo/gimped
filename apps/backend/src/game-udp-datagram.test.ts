import { describe, expect, it } from "@effect/vitest";
import { BitWriter } from "./bitstream.ts";
import { decodeUdpDatagram, encodeUdpDatagram, STUB_UDP_CHANNEL } from "./game-udp-datagram.ts";
import { PacketType } from "./packets.ts";

describe("game udp datagram", () => {
  it("round-trips a reliable batched move input", () => {
    const writer = new BitWriter();
    writer.writeBits(4, 1);
    writer.writePackedU32(32);
    writer.writeBits(14, 8);
    const move = writer.toUint8Array();
    const payload = encodeUdpDatagram({
      sessionId: 0,
      channel: STUB_UDP_CHANNEL,
      seqStart: 3,
      packets: [{ type: PacketType.moveInput, payload: move }],
    });
    const datagram = decodeUdpDatagram(payload);
    expect(datagram).toEqual({
      sessionId: 0,
      channel: STUB_UDP_CHANNEL,
      reliable: true,
      seqStart: 3,
      count: 1,
      packets: [{ type: PacketType.moveInput, payload: move }],
    });
  });
});
