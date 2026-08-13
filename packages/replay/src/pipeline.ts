import { IoError, MalformedJson, toIoError, toMalformedJson } from "@gimped/common";
import { Context, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { Envelope } from "./Envelope.ts";
import { ChecksumMismatch, GameDataError, InvalidReplay } from "./errors.ts";
import { GameData } from "./GameData.ts";
import { ReplayCodec } from "./ReplayCodec.ts";
import { ReplayJsonText } from "./ReplayJson.ts";

export type DecompileFileOptions = {
  readonly inPath: string;
  readonly outPath: string;
  readonly dataPath?: string;
};

export type CompileFileOptions = {
  readonly inPath: string;
  readonly outPath: string;
};

type DecompileError = IoError | InvalidReplay | ChecksumMismatch | GameDataError;
type CompileError = IoError | MalformedJson | InvalidReplay;

export class Pipeline extends Context.Service<
  Pipeline,
  {
    readonly decompileFile: (options: DecompileFileOptions) => Effect.Effect<void, DecompileError>;
    readonly compileFile: (options: CompileFileOptions) => Effect.Effect<void, CompileError>;
  }
>()("@gimped/replay/Pipeline") {
  static readonly layer: Layer.Layer<
    Pipeline,
    never,
    Envelope | ReplayCodec | GameData | FileSystem.FileSystem | Path.Path
  > = Layer.effect(
    Pipeline,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const envelope = yield* Envelope;
      const codec = yield* ReplayCodec;
      const gameData = yield* GameData;

      const decompileFile = Effect.fn("Pipeline.decompileFile")(function* (
        options: DecompileFileOptions,
      ) {
        const bytes = yield* fs
          .readFile(options.inPath)
          .pipe(Effect.mapError((error) => toIoError(options.inPath, error)));
        const opened = yield* envelope.open(bytes);
        const replay = yield* codec.decode(opened);
        const annotated = yield* gameData.annotate(replay, options.dataPath);
        const text = yield* Schema.encodeUnknownEffect(ReplayJsonText)(annotated).pipe(
          Effect.orDie,
        );
        yield* fs
          .writeFileString(options.outPath, `${text}\n`)
          .pipe(Effect.mapError((error) => toIoError(options.outPath, error)));
      });

      const compileFile = Effect.fn("Pipeline.compileFile")(function* (
        options: CompileFileOptions,
      ) {
        const text = yield* fs
          .readFileString(options.inPath)
          .pipe(Effect.mapError((error) => toIoError(options.inPath, error)));
        const replay = yield* Schema.decodeUnknownEffect(ReplayJsonText)(text).pipe(
          Effect.mapError((error) => toMalformedJson(options.inPath, error)),
        );
        const encoded = yield* codec.encode(replay);
        const sealed = yield* envelope.seal(encoded);
        yield* fs
          .writeFile(options.outPath, sealed)
          .pipe(Effect.mapError((error) => toIoError(options.outPath, error)));
      });

      return Pipeline.of({ decompileFile, compileFile });
    }),
  );

  /** Replay services including Pipeline; still requires FileSystem, Path, and Crypto. */
  static readonly Default: Layer.Layer<
    Pipeline | Envelope | ReplayCodec | GameData,
    never,
    FileSystem.FileSystem | Path.Path | Crypto.Crypto
  > = Layer.provideMerge(
    this.layer,
    Layer.mergeAll(Envelope.layer, ReplayCodec.layer, GameData.layer),
  );
}

export const decompileFile = Effect.fn("decompileFile")(function* (options: DecompileFileOptions) {
  const pipeline = yield* Pipeline;
  return yield* pipeline.decompileFile(options);
});

export const compileFile = Effect.fn("compileFile")(function* (options: CompileFileOptions) {
  const pipeline = yield* Pipeline;
  return yield* pipeline.compileFile(options);
});

export const layer = Pipeline.Default;
