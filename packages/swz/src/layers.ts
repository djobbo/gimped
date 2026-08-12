import { NodeServices } from "@effect/platform-node";
import { Layer } from "effect";
import { EntryIo } from "./EntryIo.ts";
import { JsonTranspile } from "./JsonTranspile.ts";
import { Pipeline } from "./pipeline.ts";
import { SwzCodec } from "./SwzCodec.ts";
import { VersionKeys } from "./VersionKeys.ts";
import { Well512 } from "./Well512.ts";

/** Full Node runtime + all SWZ services for tests and the CLI. */
export const TestLive = Pipeline.Default.pipe(Layer.provideMerge(NodeServices.layer));

export const CodecLive = SwzCodec.layer.pipe(
  Layer.provide(Well512.layer),
  Layer.provideMerge(NodeServices.layer),
);

export const Well512Live = Well512.layer;

export const VersionKeysLive = VersionKeys.layer;

export const EntryIoLive = EntryIo.layer.pipe(Layer.provideMerge(NodeServices.layer));

export const JsonTranspileLive = JsonTranspile.layer.pipe(Layer.provideMerge(NodeServices.layer));
