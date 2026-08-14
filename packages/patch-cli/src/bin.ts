#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { layer } from "@gimped/patch";
import { Effect, Layer } from "effect";
import { Command } from "effect/unstable/cli";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { root } from "./cli.ts";

const AppLive = layer.pipe(
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(FetchHttpClient.layer),
);

NodeRuntime.runMain(Command.run(root, { version: "0.0.0" }).pipe(Effect.provide(AppLive)));
