import { toIoError } from "@gimped/common";
import { Context, Crypto, Effect, FileSystem, Layer, Path } from "effect";
import { EntryIo } from "./EntryIo.ts";
import {
  ChecksumMismatch,
  InvalidSwz,
  IoError,
  MalformedCsv,
  MalformedJson,
  MalformedXml,
  MissingRegistry,
  UnknownVersion,
} from "./errors.ts";
import { CsvCodec } from "./csvCodec.ts";
import { JsonTranspile } from "./JsonTranspile.ts";
import { SwzCodec } from "./SwzCodec.ts";
import { VersionKeys } from "./VersionKeys.ts";
import { Well512 } from "./Well512.ts";
import { XmlCodec } from "./xmlCodec.ts";

export type FilePipelineOptions = {
  readonly inPath: string;
  readonly outPath: string;
  readonly version: string;
  readonly json: boolean;
};

type PipelineError =
  | IoError
  | MissingRegistry
  | UnknownVersion
  | ChecksumMismatch
  | InvalidSwz
  | MalformedCsv
  | MalformedXml
  | MalformedJson;

export class Pipeline extends Context.Service<
  Pipeline,
  {
    readonly decompileFile: (options: FilePipelineOptions) => Effect.Effect<void, PipelineError>;
    readonly compileFile: (options: FilePipelineOptions) => Effect.Effect<void, PipelineError>;
  }
>()("@gimped/swz/Pipeline") {
  static readonly layer: Layer.Layer<
    Pipeline,
    never,
    SwzCodec | VersionKeys | EntryIo | JsonTranspile | FileSystem.FileSystem | Path.Path
  > = Layer.effect(
    Pipeline,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const codec = yield* SwzCodec;
      const versionKeys = yield* VersionKeys;
      const entryIo = yield* EntryIo;
      const jsonTranspile = yield* JsonTranspile;

      const decompileFile = Effect.fn("Pipeline.decompileFile")(function* (
        options: FilePipelineOptions,
      ) {
        const bytes = yield* fs
          .readFile(options.inPath)
          .pipe(Effect.mapError((error) => toIoError(options.inPath, error)));
        const key = yield* versionKeys.resolveKey(options.version);
        const entries = yield* codec.decompile(bytes, key);

        yield* options.json
          ? jsonTranspile.writeJsonDir(entries, options.outPath)
          : entryIo.writeNativeDir(entries, options.outPath);
      });

      const compileFile = Effect.fn("Pipeline.compileFile")(function* (
        options: FilePipelineOptions,
      ) {
        const entries = yield* options.json
          ? jsonTranspile.readJsonDir(options.inPath)
          : entryIo.readNativeDir(options.inPath);
        const key = yield* versionKeys.resolveKey(options.version);
        const bytes = yield* codec.compile(entries, key);

        yield* fs
          .writeFile(options.outPath, bytes)
          .pipe(Effect.mapError((error) => toIoError(options.outPath, error)));
      });

      return Pipeline.of({ decompileFile, compileFile });
    }),
  );

  /** SWZ services including Pipeline; still requires FileSystem, Path, and Crypto. */
  static readonly Default: Layer.Layer<
    Pipeline | SwzCodec | VersionKeys | EntryIo | JsonTranspile | Well512 | XmlCodec | CsvCodec,
    never,
    FileSystem.FileSystem | Path.Path | Crypto.Crypto
  > = Layer.provideMerge(
    this.layer,
    Layer.mergeAll(
      SwzCodec.layer.pipe(Layer.provide(Well512.layer)),
      VersionKeys.layer,
      EntryIo.layer,
      JsonTranspile.layer.pipe(
        Layer.provideMerge(XmlCodec.layer),
        Layer.provideMerge(CsvCodec.layer),
      ),
      Well512.layer,
    ),
  );
}

export const decompileFile = Effect.fn("decompileFile")(function* (options: FilePipelineOptions) {
  const pipeline = yield* Pipeline;
  return yield* pipeline.decompileFile(options);
});

export const compileFile = Effect.fn("compileFile")(function* (options: FilePipelineOptions) {
  const pipeline = yield* Pipeline;
  return yield* pipeline.compileFile(options);
});

export const layer = Pipeline.Default;
