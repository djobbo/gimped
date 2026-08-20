import { describe, expect, it } from "@effect/vitest";
import { BitWriter } from "./bitstream.ts";
import {
  decodeUdpTunnel,
  decodeUdpTunnelAck,
  encodeUdpTunnel,
  UDP_TUNNEL_ACK,
} from "./game-udp-tunnel.ts";
import { encodeUdpTunnelAck } from "./game-input.ts";
import { PacketType } from "./packets.ts";

describe("game udp tunnel", () => {
  it("round-trips a bundled move input", () => {
    const writer = new BitWriter();
    writer.writeBits(4, 1);
    writer.writePackedU32(32);
    writer.writeBits(14, 8);
    const move = writer.toUint8Array();
    const payload = encodeUdpTunnel({
      ackSeq: 5,
      seqStart: 2,
      packets: [{ type: PacketType.moveInput, payload: move }],
    });
    const tunnel = decodeUdpTunnel(payload);
    expect(tunnel).toEqual({
      ackSeq: 5,
      seqStart: 2,
      count: 1,
      packets: [{ type: PacketType.moveInput, payload: move }],
    });
  });

  it("round-trips udp tunnel ack inner payload", () => {
    const payload = encodeUdpTunnelAck(42);
    expect(decodeUdpTunnelAck(payload)).toBe(42);
  });

  it("decodes ack inner type constant", () => {
    expect(UDP_TUNNEL_ACK).toBe(10);
  });
});
