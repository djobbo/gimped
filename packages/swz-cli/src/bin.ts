#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { root } from "./cli.ts";

NodeRuntime.runMain(
  Command.run(root, { version: "0.0.0" }).pipe(Effect.provide(NodeServices.layer)),
);
