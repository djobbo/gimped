import { ReplayCodec } from "./ReplayCodec.ts";

/** Bitstream codec on its own; it needs no platform services. */
export const CodecLive = ReplayCodec.layer;
