import { NodeServices } from "@effect/platform-node";
import { Layer } from "effect";
import { Envelope } from "./Envelope.ts";
import { Pipeline } from "./pipeline.ts";
import { ReplayCodec } from "./ReplayCodec.ts";

/** Bitstream codec on its own; it needs no platform services. */
export const CodecLive = ReplayCodec.layer;

export const EnvelopeLive = Envelope.layer;

/** Full Node runtime + Pipeline for tests. */
export const TestLive = Pipeline.Default.pipe(Layer.provideMerge(NodeServices.layer));
