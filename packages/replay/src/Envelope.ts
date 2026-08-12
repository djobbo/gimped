import { Context, Effect, Layer } from "effect";
import { deflateSync, inflateSync } from "node:zlib";
import { InvalidReplay } from "./errors.ts";
import { Xor } from "./xor.ts";

export class Envelope extends Context.Service<
  Envelope,
  {
    readonly open: (bytes: Uint8Array) => Effect.Effect<Uint8Array, InvalidReplay>;
    readonly seal: (bytes: Uint8Array) => Effect.Effect<Uint8Array>;
  }
>()("@gimped/replay/Envelope") {
  static readonly layer: Layer.Layer<Envelope, never, Xor> = Layer.effect(
    Envelope,
    Effect.gen(function* () {
      const xor = yield* Xor;

      const open = Effect.fn("Envelope.open")(function* (bytes: Uint8Array) {
        return yield* Effect.try(() => inflateSync(bytes)).pipe(
          Effect.flatMap((plain) => xor.xorBytes(plain)),
          Effect.orElseSucceed(() => bytes),
        );
      });

      const seal = Effect.fn("Envelope.seal")(function* (bytes: Uint8Array) {
        const xored = yield* xor.xorBytes(bytes);
        return deflateSync(xored);
      });

      return Envelope.of({ open, seal });
    }),
  ).pipe(Layer.provide(Xor.layer));
}
