import { Command } from "effect/unstable/cli";
import { compile } from "./commands/compile.ts";
import { decompile } from "./commands/decompile.ts";

export const root = Command.make("swz").pipe(
  Command.withDescription("Brawlhalla SWZ tools"),
  Command.withSubcommands([decompile, compile]),
);
