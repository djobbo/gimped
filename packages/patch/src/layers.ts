import { NodeServices } from "@effect/platform-node";
import { Layer } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { PatchReporter } from "./PatchReporter.ts";
import { Pipeline } from "./pipeline.ts";
import { SteamGuard } from "./SteamGuard.ts";

export const TestLive = Pipeline.Default.pipe(
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(FetchHttpClient.layer),
  Layer.provideMerge(SteamGuard.succeed("12345")),
  Layer.provideMerge(PatchReporter.noop),
);

export const layer = Pipeline.Default.pipe(
  Layer.provideMerge(SteamGuard.succeed("12345")),
  Layer.provideMerge(PatchReporter.noop),
);

export { clearPatch, fetch, fetchStream } from "./pipeline.ts";
