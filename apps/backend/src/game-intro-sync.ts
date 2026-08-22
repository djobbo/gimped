import { BitReader, BitWriter } from "./bitstream.ts";

/** class_139.method_2194 — client 10419 intro entity sync during countdown. */
export const decodeIntroEntitySync = (
  payload: Uint8Array,
): { readonly active: boolean; readonly clientSimTick: number } | undefined => {
  if (payload.length === 0) return undefined;
  try {
    const bits = new BitReader(payload);
    const active = bits.readBool();
    const clientSimTick = bits.readPackedU32();
    return { active, clientSimTick };
  } catch {
    return undefined;
  }
};

/** Server→client intro entity sync (same bool + sim tick header as client sends). */
export const encodeIntroEntitySync = (sync: {
  readonly active: boolean;
  readonly clientSimTick: number;
}): Uint8Array => {
  const bits = new BitWriter();
  bits.writeBool(sync.active);
  bits.writePackedU32(sync.clientSimTick);
  return bits.toUint8Array();
};

/** LinkUpdater.method_8956 — intro player/ruleset sync (10415). Minimal stub: server tick + checksum. */
export const encodeIntroPlayerSync = (sync: {
  readonly serverTick: number;
  readonly field2: number;
  readonly field4: number;
}): Uint8Array => {
  const bits = new BitWriter();
  bits.writePackedU32(sync.serverTick);
  bits.writePackedU32(sync.field2);
  bits.writeBool(false);
  bits.writePackedU32(sync.field4);
  bits.writePackedU32(0);
  return bits.toUint8Array();
};
