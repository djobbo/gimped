import { ByteReader, ByteWriter } from "@gimped/common";
import type { UdpInnerPacket } from "./game-udp-tunnel.ts";
import { decodeUdpTunnel } from "./game-udp-tunnel.ts";

/** class_647.method_2969 — UDP channel from 10310 packed u24 (_loc4_). */
export const STUB_UDP_CHANNEL = 1;

export type UdpDatagram = {
  readonly sessionId: number;
  readonly channel: number;
  readonly reliable: boolean;
  readonly seqStart: number;
  readonly count: number;
  readonly packets: ReadonlyArray<UdpInnerPacket>;
};

const readInnerPackets = (reader: ByteReader, count: number): ReadonlyArray<UdpInnerPacket> => {
  const packets: UdpInnerPacket[] = [];
  for (let i = 0; i < count; i++) {
    if (reader.remaining < 4) break;
    const type = reader.readU16BE();
    const length = reader.readU16BE();
    if (reader.remaining < length) break;
    packets.push({ type, payload: reader.readBytes(length) });
  }
  return packets;
};

const decodeUdpBody = (payload: Uint8Array, offset: number): UdpDatagram | undefined => {
  if (payload.length - offset < 7) return undefined;
  const reader = new ByteReader(payload, offset);
  const sessionId = reader.readU32BE();
  const channel = reader.readU16BE();
  const reliable = reader.readU8() !== 0;
  let seqStart = 0;
  let count = 1;
  if (reliable) {
    if (reader.remaining < 4) return undefined;
    seqStart = reader.readU16BE();
    count = reader.readU16BE();
  }
  const packets = readInnerPackets(reader, count);
  if (packets.length === 0) return undefined;
  return { sessionId, channel, reliable, seqStart, count, packets };
};

/** class_647.method_2064 → method_4767 (param2=true) — gameplay UDP datagram body. */
export const decodeUdpDatagram = (payload: Uint8Array): UdpDatagram | undefined => {
  if (payload.length < 7) return undefined;
  if (payload[0] === 0) {
    return decodeUdpBody(payload, 1);
  }
  return decodeUdpBody(payload, 0);
};

/** class_647.method_2568 — unreliable ack datagram (resets UDP timeout). */
export const encodeUdpUnreliable = (datagram: {
  readonly sessionId: number;
  readonly channel: number;
  readonly packets: ReadonlyArray<UdpInnerPacket>;
}): Uint8Array => {
  const writer = new ByteWriter();
  writer.writeU8(0);
  writer.writeU32BE(datagram.sessionId);
  writer.writeU16BE(datagram.channel);
  writer.writeU8(0);
  for (const packet of datagram.packets) {
    writer.writeU16BE(packet.type);
    writer.writeU16BE(packet.payload.length);
    writer.writeBytes(packet.payload);
  }
  return writer.toUint8Array();
};

/** class_647.method_5507 + method_6679 — reliable batched server reply. */
export const encodeUdpDatagram = (datagram: {
  readonly sessionId: number;
  readonly channel: number;
  readonly seqStart: number;
  readonly packets: ReadonlyArray<UdpInnerPacket>;
}): Uint8Array => {
  const writer = new ByteWriter();
  writer.writeU8(0);
  writer.writeU32BE(datagram.sessionId);
  writer.writeU16BE(datagram.channel);
  writer.writeU8(1);
  writer.writeU16BE(datagram.seqStart);
  writer.writeU16BE(datagram.packets.length);
  for (const packet of datagram.packets) {
    writer.writeU16BE(packet.type);
    writer.writeU16BE(packet.payload.length);
    writer.writeBytes(packet.payload);
  }
  return writer.toUint8Array();
};

/** Try several client send shapes (0-prefix body, raw body, TCP 10316 tunnel). */
export const decodeGameplayDatagram = (payload: Uint8Array): UdpDatagram | undefined => {
  const datagram = decodeUdpDatagram(payload);
  if (datagram !== undefined) return datagram;

  const tunnel = decodeUdpTunnel(payload);
  if (tunnel !== undefined && tunnel.packets.length > 0) {
    return {
      sessionId: 0,
      channel: STUB_UDP_CHANNEL,
      reliable: true,
      seqStart: tunnel.seqStart,
      count: tunnel.count,
      packets: tunnel.packets,
    };
  }

  if (payload.length >= 1 && payload[0] === 0) {
    const tunnelAfterPrefix = decodeUdpTunnel(payload.subarray(1));
    if (tunnelAfterPrefix !== undefined && tunnelAfterPrefix.packets.length > 0) {
      return {
        sessionId: 0,
        channel: STUB_UDP_CHANNEL,
        reliable: true,
        seqStart: tunnelAfterPrefix.seqStart,
        count: tunnelAfterPrefix.count,
        packets: tunnelAfterPrefix.packets,
      };
    }
  }

  return undefined;
};
