import { decompileFile } from "@gimped/anm";
import { Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

export const decompile = Command.make(
  "decompile",
  {
    in: Flag.string("in").pipe(Flag.withDescription("Input .anm file")),
    out: Flag.string("out").pipe(Flag.withDescription("Output directory")),
    data: Flag.string("data").pipe(
      Flag.optional,
      Flag.withDescription("SWZ directory or .swz for bone names"),
    ),
  },
  Effect.fn("decompile")(function* (config) {
    return yield* decompileFile({
      inPath: config.in,
      outPath: config.out,
      dataPath: Option.getOrUndefined(config.data),
    });
  }),
).pipe(Command.withDescription("Decompile a .anm file to JSON"));
