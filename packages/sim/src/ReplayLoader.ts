import { toIoError, type IoError } from "@gimped/common";
import {
  Envelope,
  ReplayCodec,
  type ChecksumMismatch,
  type InvalidReplay,
  type Replay,
} from "@gimped/replay";
import { Context, Effect, FileSystem, Layer } from "effect";

export class ReplayLoader extends Context.Service<
  ReplayLoader,
  {
    readonly fromBytes: (
      bytes: Uint8Array,
    ) => Effect.Effect<Replay, InvalidReplay | ChecksumMismatch>;
    readonly fromPath: (
      path: string,
    ) => Effect.Effect<Replay, IoError | InvalidReplay | ChecksumMismatch>;
  }
>()("@gimped/sim/ReplayLoader") {
  static readonly layer: Layer.Layer<
    ReplayLoader,
    never,
    FileSystem.FileSystem | Envelope | ReplayCodec
  > = Layer.effect(
    ReplayLoader,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const envelope = yield* Envelope;
      const codec = yield* ReplayCodec;

      const fromBytes = Effect.fn("ReplayLoader.fromBytes")(function* (bytes: Uint8Array) {
        const opened = yield* envelope.open(bytes);
        return yield* codec.decode(opened);
      });

      const fromPath = Effect.fn("ReplayLoader.fromPath")(function* (path: string) {
        const bytes = yield* fs
          .readFile(path)
          .pipe(Effect.mapError((error) => toIoError(path, error)));
        return yield* fromBytes(bytes);
      });

      return ReplayLoader.of({ fromBytes, fromPath });
    }),
  );
}
