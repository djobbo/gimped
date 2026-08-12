import { Envelope } from "./Envelope.ts";
import { ReplayCodec } from "./ReplayCodec.ts";

/** Bitstream codec on its own; it needs no platform services. */
export const CodecLive = ReplayCodec.layer;

export const EnvelopeLive = Envelope.layer;
