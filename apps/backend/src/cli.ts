import { Command } from "effect/unstable/cli";
import { gameListen } from "./commands/game-listen.ts";
import { listen } from "./commands/listen.ts";

const game = Command.make("game").pipe(
  Command.withDescription("Game-server process"),
  Command.withSubcommands([gameListen]),
);

export const root = Command.make("backend").pipe(
  Command.withDescription("Self-hosted Brawlhalla backend stub"),
  Command.withSubcommands([listen, game]),
);
