import { decompileFile } from "@gimped/replay";
import { Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

export const decompile = Command.make(
  "decompile",
  {
    in: Flag.string("in").pipe(Flag.withDescription("Input .replay file")),
    out: Flag.string("out").pipe(Flag.withDescription("Output JSON file")),
    data: Flag.string("data").pipe(
      Flag.optional,
      Flag.withDescription("SWZ directory or .swz for ID names"),
    ),
  },
  (config) =>
    decompileFile({
      inPath: config.in,
      outPath: config.out,
      dataPath: Option.getOrUndefined(config.data),
    }),
).pipe(Command.withDescription("Decompile a .replay file to JSON"));
