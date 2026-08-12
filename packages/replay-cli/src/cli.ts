import { Command } from "effect/unstable/cli";
import { compile } from "./commands/compile.ts";
import { decompile } from "./commands/decompile.ts";

export const root = Command.make("replay").pipe(
  Command.withDescription("Brawlhalla replay tools"),
  Command.withSubcommands([decompile, compile]),
);
