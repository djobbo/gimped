#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { dotEnvLayer } from "@gimped/common";
import { layer, PatchReporter, SteamCredentials, SteamGuard } from "@gimped/patch";
import { Effect, Layer } from "effect";
import { Command } from "effect/unstable/cli";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { root } from "./cli.ts";

const AppLive = layer.pipe(
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(FetchHttpClient.layer),
  Layer.provideMerge(dotEnvLayer.pipe(Layer.provide(NodeServices.layer))),
  Layer.provideMerge(SteamCredentials.layerFromConfig),
  Layer.provideMerge(SteamGuard.layerStdin.pipe(Layer.provide(NodeServices.layer))),
  Layer.provideMerge(PatchReporter.noop),
);

NodeRuntime.runMain(Command.run(root, { version: "0.0.0" }).pipe(Effect.provide(AppLive)));
