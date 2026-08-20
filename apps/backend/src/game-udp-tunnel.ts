import { ByteReader, ByteWriter } from "@gimped/common";
import { BitReader } from "./bitstream.ts";
import type { GameChildState } from "./game-child-model.ts";
import { trackClientSimTick } from "./game-child-model.ts";
import {
  decodeGameInput,
  encodeUdpTunnelAck,
  queueMoveInput,
  type GameInput,
} from "./game-input.ts";
import {
  decodeGameplayDatagram,
  encodeUdpUnreliable,
  STUB_UDP_CHANNEL,
} from "./game-udp-datagram.ts";
import type { TcpFrame } from "./framing.ts";
import { PacketType } from "./packets.ts";

/** class_245.var_14356 — sequence ack inside a gameplay bundle. */
export const UDP_TUNNEL_ACK = 10;

export type UdpInnerPacket = {
  readonly type: number;
  readonly payload: Uint8Array;
};

export type UdpTunnel = {
  readonly ackSeq: number;
  readonly seqStart: number;
  readonly count: number;
  readonly packets: ReadonlyArray<UdpInnerPacket>;
};

/** class_647.method_4767 TCP path (10316 payload, param2=false). */
export const decodeUdpTunnel = (payload: Uint8Array): UdpTunnel | undefined => {
  if (payload.length < 6) return undefined;
  const reader = new ByteReader(payload);
  const ackSeq = reader.readU16BE();
  const seqStart = reader.readU16BE();
  const count = reader.readU16BE();
  const packets: UdpInnerPacket[] = [];
  for (let i = 0; i < count; i++) {
    if (reader.remaining < 4) break;
    const type = reader.readU16BE();
    const length = reader.readU16BE();
    if (reader.remaining < length) break;
    packets.push({ type, payload: reader.readBytes(length) });
  }
  return { ackSeq, seqStart, count, packets };
};

/** class_647.method_508 — bundled server reply inside 10316. */
export const encodeUdpTunnel = (tunnel: {
  readonly ackSeq: number;
  readonly seqStart: number;
  readonly packets: ReadonlyArray<UdpInnerPacket>;
}): Uint8Array => {
  const writer = new ByteWriter();
  writer.writeU16BE(tunnel.ackSeq);
  writer.writeU16BE(tunnel.seqStart);
  writer.writeU16BE(tunnel.packets.length);
  for (const packet of tunnel.packets) {
    writer.writeU16BE(packet.type);
    writer.writeU16BE(packet.payload.length);
    writer.writeBytes(packet.payload);
  }
  return writer.toUint8Array();
};

export const decodeUdpTunnelAck = (payload: Uint8Array): number | undefined => {
  try {
    const bits = new BitReader(payload);
    return bits.readPackedU24();
  } catch {
    return undefined;
  }
};

const buildAckOnlyPackets = (udpAckSeq: number): ReadonlyArray<UdpInnerPacket> => [
  { type: UDP_TUNNEL_ACK, payload: encodeUdpTunnelAck(udpAckSeq) },
];

const applyInnerPackets = (
  state: GameChildState,
  packets: ReadonlyArray<UdpInnerPacket>,
  ackSeq: number,
) => {
  const inputs: GameInput[] = [];
  let udpAckSeq = Math.max(state.udpAckSeq, ackSeq);

  for (const inner of packets) {
    if (inner.type === UDP_TUNNEL_ACK) {
      const ack = decodeUdpTunnelAck(inner.payload);
      if (ack !== undefined) udpAckSeq = Math.max(udpAckSeq, ack);
      continue;
    }
    const decoded = decodeGameInput(inner.type, inner.payload);
    if (decoded !== undefined) inputs.push(decoded);
  }

  let nextState: GameChildState = {
    ...state,
    udpAckSeq,
  };

  for (const input of inputs) {
    if (input._tag === "Move") {
      nextState = trackClientSimTick(
        queueMoveInput(nextState, {
          entityId: input.entityId,
          tick: input.tick,
          input: input.input,
        }),
        input.tick,
      );
    } else if (input._tag === "TickAck") {
      nextState = { ...nextState, clientTick: input.clientTick };
    } else if (input._tag === "SimReady") {
      nextState = { ...nextState, simReady: true };
    }
  }

  return { state: nextState, inputs } satisfies {
    readonly state: GameChildState;
    readonly inputs: ReadonlyArray<GameInput>;
  };
};

export type UdpTunnelIngestResult = {
  readonly state: GameChildState;
  readonly inputs: ReadonlyArray<GameInput>;
  readonly frames: ReadonlyArray<TcpFrame>;
};

export type UdpDatagramIngestResult = {
  readonly state: GameChildState;
  readonly inputs: ReadonlyArray<GameInput>;
  readonly reply: Uint8Array;
};

/** Handle client 10316 gameplay bundles during active match. */
export const ingestUdpTunnel = (
  payload: Uint8Array,
  state: GameChildState,
): UdpTunnelIngestResult | undefined => {
  const tunnel = decodeUdpTunnel(payload);
  if (tunnel === undefined) return undefined;

  const applied = applyInnerPackets(state, tunnel.packets, tunnel.ackSeq);
  const innerOut = buildAckOnlyPackets(applied.state.udpAckSeq);

  return {
    state: applied.state,
    inputs: applied.inputs,
    frames: [
      {
        type: PacketType.udpTunnel,
        seq: undefined,
        payload: encodeUdpTunnel({
          ackSeq: applied.state.udpAckSeq,
          seqStart: tunnel.seqStart,
          packets: innerOut,
        }),
      },
    ],
  };
};

/** Handle client gameplay UDP datagrams (class_647.method_2064). */
export const ingestUdpDatagram = (
  payload: Uint8Array,
  state: GameChildState,
): UdpDatagramIngestResult | undefined => {
  const datagram = decodeGameplayDatagram(payload);
  if (datagram === undefined) return undefined;

  const ackSeq = datagram.reliable ? datagram.seqStart + datagram.count - 1 : datagram.seqStart;
  const applied = applyInnerPackets(state, datagram.packets, ackSeq);
  const sessionId = datagram.sessionId !== 0 ? datagram.sessionId : state.udpSessionId;
  const channel = datagram.channel || STUB_UDP_CHANNEL;

  return {
    state: applied.state,
    inputs: applied.inputs,
    reply: encodeUdpUnreliable({
      sessionId,
      channel,
      packets: buildAckOnlyPackets(applied.state.udpAckSeq),
    }),
  };
};

// encodeUdpTunnelAck lives in game-input.ts
