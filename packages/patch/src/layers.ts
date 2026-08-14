import { NodeServices } from "@effect/platform-node";
import { Layer } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { Pipeline } from "./pipeline.ts";

export const TestLive = Pipeline.Default.pipe(
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(FetchHttpClient.layer),
);

export const layer = Pipeline.Default;

export { clearPatch, fetch, fetchStream } from "./pipeline.ts";
