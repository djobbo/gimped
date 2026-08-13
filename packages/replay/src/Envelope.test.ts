import { expect, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { deflateSync } from "node:zlib";
import { Envelope } from "./Envelope.ts";
import { EnvelopeLive } from "./layers.ts";
import { xorBytes, Xor } from "./xor.ts";

layer(Layer.merge(EnvelopeLive, Xor.layer))("Envelope", (it) => {
  it.effect("open reverses seal", () =>
    Effect.gen(function* () {
      const plain = Uint8Array.from([1, 2, 3, 4, 5]);
      const env = yield* Envelope;
      const sealed = yield* env.seal(plain);
      const opened = yield* env.open(sealed);
      expect([...opened]).toEqual([...plain]);
    }),
  );

  it.effect("open uses raw bytes when inflate fails", () =>
    Effect.gen(function* () {
      const raw = Uint8Array.from([9, 8, 7]);
      const env = yield* Envelope;
      const opened = yield* env.open(raw);
      expect([...opened]).toEqual([9, 8, 7]);
    }),
  );

  it.effect("open inflates then XORs", () =>
    Effect.gen(function* () {
      const plain = Uint8Array.from([1, 2, 3]);
      const xored = yield* xorBytes(plain);
      const sealed = deflateSync(xored);
      const env = yield* Envelope;
      const opened = yield* env.open(sealed);
      expect([...opened]).toEqual([1, 2, 3]);
    }),
  );
});
