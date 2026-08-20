import { BitReader } from "./bitstream.ts";

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
