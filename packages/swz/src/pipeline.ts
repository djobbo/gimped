import * as fs from "node:fs/promises";
import { Effect } from "effect";
import { readNativeDir, writeNativeDir } from "./EntryIo.ts";
import { IoError } from "./errors.ts";
import { readJsonDir, writeJsonDir } from "./JsonTranspile.ts";
import { compile, decompile } from "./SwzCodec.ts";
import { resolveKey } from "./VersionKeys.ts";

export type FilePipelineOptions = {
  readonly inPath: string;
  readonly outPath: string;
  readonly version: string;
  readonly json: boolean;
};

const tryIo = <A>(ioPath: string, operation: () => Promise<A>): Effect.Effect<A, IoError> =>
  Effect.tryPromise({
    try: operation,
    catch: (error) =>
      new IoError({
        path: ioPath,
        message: error instanceof Error ? error.message : String(error),
      }),
  });

export const decompileFile = (options: FilePipelineOptions) =>
  Effect.gen(function* () {
    const bytes = yield* tryIo(options.inPath, () => fs.readFile(options.inPath));
    const key = yield* resolveKey(options.version);
    const entries = yield* decompile(bytes, key);

    yield* options.json
      ? writeJsonDir(entries, options.outPath)
      : writeNativeDir(entries, options.outPath);
  });

export const compileFile = (options: FilePipelineOptions) =>
  Effect.gen(function* () {
    const entries = yield* options.json
      ? readJsonDir(options.inPath)
      : readNativeDir(options.inPath);
    const key = yield* resolveKey(options.version);
    const bytes = yield* compile(entries, key);

    yield* tryIo(options.outPath, () => fs.writeFile(options.outPath, bytes));
  });
