import { Command } from "effect/unstable/cli";
import { listen } from "./commands/listen.ts";

export const root = Command.make("backend").pipe(
  Command.withDescription("Self-hosted Brawlhalla backend stub"),
  Command.withSubcommands([listen]),
);
