import { Command } from "effect/unstable/cli";
import { fetchCmd } from "./commands/fetch.ts";

export const root = Command.make("patch").pipe(
  Command.withDescription("Brawlhalla patch fetch"),
  Command.withSubcommands([fetchCmd]),
);
