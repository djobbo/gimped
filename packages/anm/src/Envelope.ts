import { ByteReader, ByteWriter } from "@gimped/common";
import { Context, Effect, Layer } from "effect";
import { deflateSync, inflateSync } from "node:zlib";
import { InvalidAnm } from "./errors.ts";

export class Envelope extends Context.Service<
  Envelope,
  {
    readonly open: (bytes: Uint8Array) => Effect.Effect<Uint8Array, InvalidAnm>;
    readonly seal: (payload: Uint8Array) => Effect.Effect<Uint8Array>;
  }
>()("@gimped/anm/Envelope") {
  static readonly layer: Layer.Layer<Envelope> = Layer.sync(Envelope, () =>
    Envelope.of({
      open: Effect.fn("Envelope.open")(function* (bytes: Uint8Array) {
        if (bytes.length < 4) {
          return yield* new InvalidAnm({ reason: "truncated" });
        }
        const reader = new ByteReader(bytes);
        reader.readU32LE();
        const rest = bytes.subarray(reader.offset);
        return yield* Effect.try({
          try: () => inflateSync(rest),
          catch: () => new InvalidAnm({ reason: "bad zlib" }),
        });
      }),
      seal: Effect.fn("Envelope.seal")(function* (payload: Uint8Array) {
        const writer = new ByteWriter();
        writer.writeU32LE(payload.byteLength);
        writer.writeBytes(deflateSync(payload));
        return writer.toUint8Array();
      }),
    }),
  );
}
