import { Context, Effect, Layer } from "effect";

export const XOR_KEY = Uint8Array.from([
  107, 16, 222, 60, 68, 75, 209, 70, 160, 16, 82, 193, 178, 49, 211, 106, 251, 172, 17, 222, 6, 104,
  8, 120, 140, 213, 179, 249, 106, 64, 214, 19, 12, 174, 157, 197, 212, 107, 84, 114, 252, 87, 93,
  26, 6, 115, 194, 81, 75, 176, 201, 140, 120, 4, 17, 122, 239, 116, 62, 70, 57, 160, 199, 166,
]);

const xorBytesSync = (bytes: Uint8Array): Uint8Array => {
  const out = new Uint8Array(bytes.length);
  const n = XOR_KEY.length;
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i]! ^ XOR_KEY[i % n]!;
  }
  return out;
};

export class Xor extends Context.Service<
  Xor,
  {
    readonly xorBytes: (bytes: Uint8Array) => Effect.Effect<Uint8Array>;
  }
>()("@gimped/replay/Xor") {
  static readonly layer: Layer.Layer<Xor> = Layer.sync(Xor, () => ({
    xorBytes: Effect.fn("Xor.xorBytes")((bytes: Uint8Array) =>
      Effect.sync(() => xorBytesSync(bytes)),
    ),
  }));
}

export const xorBytes = Effect.fn("xorBytes")(function* (bytes: Uint8Array) {
  const xor = yield* Xor;
  return yield* xor.xorBytes(bytes);
});
