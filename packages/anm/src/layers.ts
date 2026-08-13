import { NodeServices } from "@effect/platform-node";
import { Layer } from "effect";
import { Pipeline } from "./pipeline.ts";

export const TestLive = Pipeline.Default.pipe(Layer.provideMerge(NodeServices.layer));
