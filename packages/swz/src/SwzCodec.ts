import { Context, Crypto, Effect, Layer } from "effect";
import { ByteReader, ByteWriter, rotr } from "./binary.ts";
import { ChecksumMismatch, InvalidSwz } from "./errors.ts";
import { Well512, type Well512Instance } from "./Well512.ts";
import { deflateSync, inflateSync } from "node:zlib";

const HEADER_CHECKSUM = 771006925;

export type SwzEntry = {
  readonly content: string;
};

const xorCountFor = (key: number): number => ((key >>> 0) % 0x1f) + 5;

const computeHeaderChecksum = (prng: Well512Instance, key: number): number => {
  let checksum = HEADER_CHECKSUM;
  for (let i = 0; i < xorCountFor(key); i++) {
    checksum = (checksum ^ prng.next()) >>> 0;
  }
  return checksum;
};

const byteMask = (random: number, index: number): number => {
  const shift = index & 0xf;
  return (((0xff << shift) & random) >>> shift) & 0xff;
};

export class SwzCodec extends Context.Service<
  SwzCodec,
  {
    readonly compile: (
      entries: readonly SwzEntry[],
      key: number,
      seed?: number,
    ) => Effect.Effect<Uint8Array>;
    readonly decompile: (
      bytes: Uint8Array,
      key: number,
    ) => Effect.Effect<SwzEntry[], ChecksumMismatch | InvalidSwz>;
  }
>()("@gimped/swz/SwzCodec") {
  static readonly layer: Layer.Layer<SwzCodec, never, Well512 | Crypto.Crypto> = Layer.effect(
    SwzCodec,
    Effect.gen(function* () {
      const well512 = yield* Well512;
      const crypto = yield* Crypto.Crypto;

      const compile = Effect.fn("SwzCodec.compile")(function* (
        entries: readonly SwzEntry[],
        key: number,
        seed?: number,
      ) {
        const prng = yield* well512.create();
        const writer = new ByteWriter();
        const normalizedSeed =
          seed !== undefined
            ? seed >>> 0
            : yield* crypto.randomIntBetween(0, 0x1_0000_0000, { halfOpen: true });

        prng.initState(normalizedSeed);
        writer.writeU32BE(computeHeaderChecksum(prng, key));
        writer.writeU32BE((normalizedSeed ^ key) >>> 0);

        for (const entry of entries) {
          const uncompressed = Buffer.from(entry.content, "utf8");
          const compressed = deflateSync(uncompressed);

          writer.writeU32BE((compressed.length ^ prng.next()) >>> 0);
          writer.writeU32BE((uncompressed.length ^ prng.next()) >>> 0);

          let checksum = prng.next();
          const encoded = new Uint8Array(compressed.length);
          for (let i = 0; i < compressed.length; i++) {
            const plainByte = compressed[i]!;
            encoded[i] = plainByte ^ byteMask(prng.next(), i);
            checksum = (plainByte ^ rotr(checksum, (i % 7) + 1)) >>> 0;
          }

          writer.writeU32BE(checksum);
          for (const byte of encoded) writer.writeU8(byte);
        }

        return writer.toUint8Array();
      });

      const decompile = Effect.fn("SwzCodec.decompile")(function* (bytes: Uint8Array, key: number) {
        if (bytes.length < 8) {
          return yield* new InvalidSwz({ reason: "SWZ header is truncated" });
        }

        const prng = yield* well512.create();
        const reader = new ByteReader(bytes);
        const expectedHeaderChecksum = reader.readU32BE();
        const seedXor = reader.readU32BE();
        const seed = (seedXor ^ key) >>> 0;
        prng.initState(seed);
        const actualHeaderChecksum = computeHeaderChecksum(prng, key);

        if (actualHeaderChecksum !== expectedHeaderChecksum) {
          return yield* new ChecksumMismatch({
            where: "header",
            expected: expectedHeaderChecksum,
            actual: actualHeaderChecksum,
          });
        }

        const entries: Array<SwzEntry> = [];
        while (reader.remaining > 12) {
          const compressedSize = (reader.readU32BE() ^ prng.next()) >>> 0;
          const uncompressedSize = (reader.readU32BE() ^ prng.next()) >>> 0;

          if (compressedSize === 0 || compressedSize > reader.remaining - 4) {
            return yield* new InvalidSwz({
              reason: `Invalid compressed entry size: ${compressedSize}`,
            });
          }

          const expectedEntryChecksum = reader.readU32BE();
          let actualEntryChecksum = prng.next();
          const compressed = new Uint8Array(compressedSize);

          for (let i = 0; i < compressedSize; i++) {
            const plainByte = reader.readU8() ^ byteMask(prng.next(), i);
            compressed[i] = plainByte;
            actualEntryChecksum = (plainByte ^ rotr(actualEntryChecksum, (i % 7) + 1)) >>> 0;
          }

          if (actualEntryChecksum !== expectedEntryChecksum) {
            return yield* new ChecksumMismatch({
              where: "entry",
              expected: expectedEntryChecksum,
              actual: actualEntryChecksum,
            });
          }

          let inflated: Buffer;
          try {
            inflated = inflateSync(compressed);
          } catch {
            return yield* new InvalidSwz({ reason: "Entry data is not valid deflate data" });
          }
          if (inflated.length !== uncompressedSize) {
            return yield* new InvalidSwz({
              reason: `Invalid uncompressed entry size: expected ${uncompressedSize}, got ${inflated.length}`,
            });
          }
          entries.push({ content: inflated.toString("utf8") });
        }

        return entries;
      });

      return SwzCodec.of({ compile, decompile });
    }),
  );

  static readonly Default = this.layer.pipe(Layer.provide(Well512.layer));
}

export const compile = Effect.fn("compile")(function* (
  entries: readonly SwzEntry[],
  key: number,
  seed?: number,
) {
  const codec = yield* SwzCodec;
  return yield* codec.compile(entries, key, seed);
});

export const decompile = Effect.fn("decompile")(function* (bytes: Uint8Array, key: number) {
  const codec = yield* SwzCodec;
  return yield* codec.decompile(bytes, key);
});
