import { Command } from "effect/unstable/cli";
import { compile } from "./commands/compile.ts";
import { decompile } from "./commands/decompile.ts";

export const root = Command.make("anm").pipe(
  Command.withDescription("Brawlhalla ANM tools"),
  Command.withSubcommands([decompile, compile]),
);
