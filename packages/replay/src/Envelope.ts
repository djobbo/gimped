import { Context, Effect, Layer } from "effect";
import { deflateSync, inflateSync } from "node:zlib";
import { InvalidReplay } from "./errors.ts";
import { xorBytes } from "./xor.ts";

export class Envelope extends Context.Service<
  Envelope,
  {
    readonly open: (bytes: Uint8Array) => Effect.Effect<Uint8Array, InvalidReplay>;
    readonly seal: (bytes: Uint8Array) => Effect.Effect<Uint8Array>;
  }
>()("@gimped/replay/Envelope") {
  static readonly layer = Layer.effect(
    Envelope,
    Effect.gen(function* () {
      const open = Effect.fn("Envelope.open")(function* (bytes: Uint8Array) {
        try {
          return xorBytes(inflateSync(bytes));
        } catch {
          return bytes;
        }
      });
      const seal = Effect.fn("Envelope.seal")(function* (bytes: Uint8Array) {
        return deflateSync(xorBytes(bytes));
      });
      return Envelope.of({ open, seal });
    }),
  );
}
