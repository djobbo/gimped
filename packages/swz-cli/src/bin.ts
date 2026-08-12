#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { layer } from "@gimped/swz";
import { Effect, Layer } from "effect";
import { Command } from "effect/unstable/cli";
import { root } from "./cli.ts";

const AppLive = layer.pipe(Layer.provideMerge(NodeServices.layer));

NodeRuntime.runMain(Command.run(root, { version: "0.0.0" }).pipe(Effect.provide(AppLive)));
