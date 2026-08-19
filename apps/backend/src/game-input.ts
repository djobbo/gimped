import { BitReader, BitWriter } from "./bitstream.ts";
import { PacketType } from "./packets.ts";

export type SimReadyInput = { readonly _tag: "SimReady" };
export type TickAckInput = { readonly _tag: "TickAck"; readonly clientTick: number };
export type MoveInput = {
  readonly _tag: "Move";
  readonly entityId: number;
  readonly x: number;
  readonly y: number;
  readonly raw: Uint8Array;
};
export type UnknownInput = {
  readonly _tag: "UnknownInput";
  readonly type: number;
  readonly payload: Uint8Array;
};

export type GameInput = SimReadyInput | TickAckInput | MoveInput | UnknownInput;

export const decodeSimReady = (_payload: Uint8Array) => ({ _tag: "SimReady" as const });

export const decodeTickAck = (payload: Uint8Array) => {
  const bits = new BitReader(payload);
  return { _tag: "TickAck" as const, clientTick: bits.readPackedU32() };
};

export const decodeMove = (payload: Uint8Array) => {
  const bits = new BitReader(payload);
  return {
    _tag: "Move" as const,
    entityId: bits.readBits(4),
    x: bits.readPackedU32(),
    y: bits.readBits(14),
    raw: payload,
  };
};

export const decodeGameInput = (type: number, payload: Uint8Array): GameInput | undefined => {
  if (type === PacketType.simReady) return decodeSimReady(payload);
  if (type === PacketType.tickAck) return decodeTickAck(payload);
  if (type === PacketType.moveInput) return decodeMove(payload);
  return undefined;
};

/** LinkUpdater.method_6885 — child→client tick pulse during active match. */
export const encodeTickPulse = (tick: number): Uint8Array => {
  const bits = new BitWriter();
  bits.writePackedU32(tick);
  return bits.toUint8Array();
};

/** LinkUpdater.method_6785 — minimal per-entity value poke for local feedback. */
export const encodeEntityValue = (entityId: number, value: number): Uint8Array => {
  const bits = new BitWriter();
  bits.writePackedU32(entityId);
  bits.writePackedU32(value);
  return bits.toUint8Array();
};
