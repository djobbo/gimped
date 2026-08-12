import { decompileFile } from "@gimped/swz";
import { Command, Flag } from "effect/unstable/cli";

export const decompile = Command.make(
  "decompile",
  {
    in: Flag.string("in").pipe(Flag.withDescription("Input SWZ file")),
    out: Flag.string("out").pipe(Flag.withDescription("Output directory")),
    version: Flag.string("version").pipe(
      Flag.withDefault("latest"),
      Flag.withDescription("Brawlhalla version"),
    ),
    json: Flag.boolean("json").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Write JSON files"),
    ),
  },
  (config) =>
    decompileFile({
      inPath: config.in,
      outPath: config.out,
      version: config.version,
      json: config.json,
    }),
).pipe(Command.withDescription("Decompile a .swz archive"));
