import { NodeServices } from "@effect/platform-node";
import { Layer } from "effect";
import { Checksum } from "./checksum.ts";
import { Envelope } from "./Envelope.ts";
import { Pipeline } from "./pipeline.ts";
import { ReplayCodec } from "./ReplayCodec.ts";
import { Xor } from "./xor.ts";

export const XorLive = Xor.layer;

export const ChecksumLive = Checksum.layer;

/** Bitstream codec on its own; it needs no platform services. */
export const CodecLive = ReplayCodec.layer;

export const EnvelopeLive = Envelope.layer;

/** Full Node runtime + Pipeline for tests. */
export const TestLive = Pipeline.Default.pipe(Layer.provideMerge(NodeServices.layer));
