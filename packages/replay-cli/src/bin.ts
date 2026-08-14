#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { dotEnvLayer } from "@gimped/common";
import { layer } from "@gimped/replay";
import { Effect, Layer } from "effect";
import { Command } from "effect/unstable/cli";
import { root } from "./cli.ts";

const AppLive = layer.pipe(
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(dotEnvLayer.pipe(Layer.provide(NodeServices.layer))),
);

NodeRuntime.runMain(Command.run(root, { version: "0.0.0" }).pipe(Effect.provide(AppLive)));
