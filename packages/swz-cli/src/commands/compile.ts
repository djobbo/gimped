import { compileFile } from "@gimped/swz";
import { Command, Flag } from "effect/unstable/cli";

export const compile = Command.make(
  "compile",
  {
    in: Flag.string("in").pipe(Flag.withDescription("Input directory")),
    out: Flag.string("out").pipe(Flag.withDescription("Output SWZ file")),
    version: Flag.string("version").pipe(
      Flag.withDefault("latest"),
      Flag.withDescription("Brawlhalla version"),
    ),
    json: Flag.boolean("json").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Read JSON files"),
    ),
  },
  (config) =>
    compileFile({
      inPath: config.in,
      outPath: config.out,
      version: config.version,
      json: config.json,
    }),
).pipe(Command.withDescription("Compile a directory into .swz"));
