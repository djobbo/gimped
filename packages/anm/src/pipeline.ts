import { IoError, MalformedJson, toIoError } from "@gimped/common";
import { Context, Crypto, Effect, FileSystem, Layer, Path } from "effect";
import { AnimDefJsonService } from "./AnimDefJson.ts";
import { AnmCodec } from "./AnmCodec.ts";
import { BoneTypes } from "./BoneTypes.ts";
import { Envelope } from "./Envelope.ts";
import { EntryIo } from "./EntryIo.ts";
import { GameDataError, InvalidAnm, MissingIndex } from "./errors.ts";

export type DecompileFileOptions = {
  readonly inPath: string;
  readonly outPath: string;
  readonly dataPath?: string;
};

export type CompileFileOptions = {
  readonly inPath: string;
  readonly outPath: string;
};

type DecompileError = IoError | InvalidAnm | GameDataError;
type CompileError = IoError | MissingIndex | MalformedJson | InvalidAnm;

export class Pipeline extends Context.Service<
  Pipeline,
  {
    readonly decompileFile: (options: DecompileFileOptions) => Effect.Effect<void, DecompileError>;
    readonly compileFile: (options: CompileFileOptions) => Effect.Effect<void, CompileError>;
  }
>()("@gimped/anm/Pipeline") {
  static readonly layer: Layer.Layer<
    Pipeline,
    never,
    Envelope | AnmCodec | EntryIo | BoneTypes | FileSystem.FileSystem
  > = Layer.effect(
    Pipeline,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const envelope = yield* Envelope;
      const codec = yield* AnmCodec;
      const entryIo = yield* EntryIo;
      const boneTypes = yield* BoneTypes;

      const decompileFile = Effect.fn("Pipeline.decompileFile")(function* (
        options: DecompileFileOptions,
      ) {
        const bytes = yield* fs
          .readFile(options.inPath)
          .pipe(Effect.mapError((error) => toIoError(options.inPath, error)));
        const opened = yield* envelope.open(bytes);
        const defs = yield* codec.decode(opened);
        const annotated = yield* boneTypes.annotate(defs, options.dataPath);
        yield* entryIo.writeDir(annotated, options.outPath);
      });

      const compileFile = Effect.fn("Pipeline.compileFile")(function* (
        options: CompileFileOptions,
      ) {
        const defs = yield* entryIo.readDir(options.inPath);
        const encoded = yield* codec.encode(defs);
        const sealed = yield* envelope.seal(encoded);
        yield* fs
          .writeFile(options.outPath, sealed)
          .pipe(Effect.mapError((error) => toIoError(options.outPath, error)));
      });

      return Pipeline.of({ decompileFile, compileFile });
    }),
  );

  static readonly Default: Layer.Layer<
    Pipeline | Envelope | AnmCodec | EntryIo | BoneTypes | AnimDefJsonService,
    never,
    FileSystem.FileSystem | Path.Path | Crypto.Crypto
  > = Layer.provideMerge(
    this.layer,
    Layer.mergeAll(
      Envelope.layer,
      AnmCodec.layer,
      AnimDefJsonService.layer,
      EntryIo.layer.pipe(Layer.provide(AnimDefJsonService.layer)),
      BoneTypes.layer,
    ),
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
