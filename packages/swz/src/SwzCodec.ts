import { randomInt } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import { Effect } from "effect";
import { ByteReader, ByteWriter, rotr } from "./binary.ts";
import { ChecksumMismatch, InvalidSwz } from "./errors.ts";
import { Well512 } from "./Well512.ts";

const HEADER_CHECKSUM = 771006925;

export type SwzEntry = {
  readonly content: string;
};

const xorCountFor = (key: number): number => ((key >>> 0) % 0x1f) + 5;

const computeHeaderChecksum = (prng: Well512, key: number): number => {
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

export const compile = (
  entries: readonly SwzEntry[],
  key: number,
  seed?: number,
): Effect.Effect<Uint8Array, never> =>
  Effect.sync(() => {
    const prng = new Well512();
    const writer = new ByteWriter();
    const normalizedSeed =
      seed !== undefined ? seed >>> 0 : (randomInt(0, 0x1_0000_0000) >>> 0);

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

export const decompile = (
  bytes: Uint8Array,
  key: number,
): Effect.Effect<SwzEntry[], ChecksumMismatch | InvalidSwz> =>
  Effect.try({
    try: () => {
      if (bytes.length < 8) {
        throw new InvalidSwz({ reason: "SWZ header is truncated" });
      }

      const reader = new ByteReader(bytes);
      const expectedHeaderChecksum = reader.readU32BE();
      const seed = (reader.readU32BE() ^ key) >>> 0;
      const prng = new Well512();
      prng.initState(seed);
      const actualHeaderChecksum = computeHeaderChecksum(prng, key);

      if (actualHeaderChecksum !== expectedHeaderChecksum) {
        throw new ChecksumMismatch({
          where: "header",
          expected: expectedHeaderChecksum,
          actual: actualHeaderChecksum,
        });
      }

      const entries: SwzEntry[] = [];
      while (reader.remaining > 12) {
        const compressedSize = (reader.readU32BE() ^ prng.next()) >>> 0;
        const uncompressedSize = (reader.readU32BE() ^ prng.next()) >>> 0;

        if (compressedSize === 0 || compressedSize > reader.remaining - 4) {
          throw new InvalidSwz({ reason: `Invalid compressed entry size: ${compressedSize}` });
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
          throw new ChecksumMismatch({
            where: "entry",
            expected: expectedEntryChecksum,
            actual: actualEntryChecksum,
          });
        }

        let inflated: Buffer;
        try {
          inflated = inflateSync(compressed);
        } catch {
          throw new InvalidSwz({ reason: "Entry data is not valid deflate data" });
        }
        if (inflated.length !== uncompressedSize) {
          throw new InvalidSwz({
            reason: `Invalid uncompressed entry size: expected ${uncompressedSize}, got ${inflated.length}`,
          });
        }
        entries.push({ content: inflated.toString("utf8") });
      }

      return entries;
    },
    catch: (error) => {
      if (error instanceof ChecksumMismatch || error instanceof InvalidSwz) return error;
      return new InvalidSwz({
        reason: error instanceof Error ? error.message : String(error),
      });
    },
  });
