import { compileFile } from "@gimped/replay";
import { Effect } from "effect";
import { Command, Flag } from "effect/unstable/cli";

export const compile = Command.make(
  "compile",
  {
    in: Flag.string("in").pipe(Flag.withDescription("Input JSON file")),
    out: Flag.string("out").pipe(Flag.withDescription("Output .replay file")),
  },
  Effect.fn("compile")(function* (config) {
    return yield* compileFile({
      inPath: config.in,
      outPath: config.out,
    });
  }),
).pipe(Command.withDescription("Compile JSON into a .replay file"));
