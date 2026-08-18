/** class_30 / class_279 bitstream (MSB-first, Flash ByteArray big-endian). */

const mask = (width: number): number => {
  if (width <= 0) return 0;
  if (width >= 32) return 0xffffffff;
  return (1 << width) - 1;
};

const bitLength = (value: number): number => {
  let n = value >>> 0;
  let bits = 0;
  while (n !== 0) {
    n >>>= 1;
    bits++;
  }
  return bits === 0 ? 1 : bits;
};

export class BitWriter {
  private bytes: number[] = [];
  private bitCount = 0;

  /** class_30.method_4003 */
  writeBits(width: number, value: number): void {
    let remaining = width;
    const bits = value >>> 0;
    while (remaining !== 0) {
      const byteIndex = this.bitCount >>> 3;
      const bitOffset = this.bitCount & 7;
      const space = 8 - bitOffset;
      const take = remaining < space ? remaining : space;
      const chunk = (bits & mask(remaining)) >>> (remaining - take);
      this.bytes[byteIndex] = (this.bytes[byteIndex] ?? 0) | (chunk << (space - take));
      remaining -= take;
      this.bitCount += take;
    }
  }

  writeBytes(data: Uint8Array): void {
    for (const byte of data) this.writeBits(8, byte);
  }

  /** class_30.method_361 / method_5700 */
  writeString(text: string): void {
    const encoded = new TextEncoder().encode(text);
    const length = encoded.byteLength > 65535 ? 65535 : encoded.byteLength;
    this.writeBits(16, length);
    this.writeBytes(encoded.subarray(0, length));
  }

  /** class_279.method_5152 */
  writeBool(value: boolean): void {
    this.writeBits(1, value ? 1 : 0);
  }

  /** class_279.method_7529 / class_30.method_2025 */
  writeU8(value: number): void {
    this.writeBits(8, value);
  }

  writePacked(prefixBits: number, value: number): void {
    const n = value >>> 0;
    const bits = bitLength(n);
    const padded = bits + (bits & 1);
    const prefix = (padded >>> 1) - 1;
    this.writeBits(prefixBits, prefix);
    this.writeBits(padded, n);
  }

  /** class_279.method_6449 / method_2533 */
  writePackedU24(value: number): void {
    this.writePacked(3, value);
  }

  /** class_279.method_8359 */
  writePackedU32(value: number): void {
    this.writePacked(4, value);
  }

  toUint8Array(): Uint8Array {
    const byteLength = (this.bitCount + 7) >>> 3;
    return Uint8Array.from(this.bytes.slice(0, byteLength));
  }
}

export class BitReader {
  private bitPos = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get remainingBits(): number {
    return this.bytes.length * 8 - this.bitPos;
  }

  /** class_30.method_5520 */
  readBits(width: number): number {
    let remaining = width;
    let result = 0;
    while (remaining !== 0) {
      const byteIndex = this.bitPos >>> 3;
      if (byteIndex >= this.bytes.length) throw new RangeError("EOF");
      const bitOffset = this.bitPos & 7;
      const space = 8 - bitOffset;
      const take = remaining < space ? remaining : space;
      const chunk = (this.bytes[byteIndex]! & mask(space)) >>> (space - take);
      result |= chunk << (remaining - take);
      remaining -= take;
      this.bitPos += take;
    }
    return result >>> 0;
  }

  readBytes(count: number): Uint8Array {
    const out = new Uint8Array(count);
    for (let i = 0; i < count; i++) out[i] = this.readBits(8);
    return out;
  }

  /** class_30.method_160 */
  readString(): string {
    const length = this.readBits(16);
    return new TextDecoder().decode(this.readBytes(length));
  }

  /** class_279.method_5853 */
  readBool(): boolean {
    return this.readBits(1) !== 0;
  }

  /** class_279.method_7022 */
  readU8(): number {
    return this.readBits(8);
  }

  readPacked(prefixBits: number): number {
    const prefix = this.readBits(prefixBits);
    const width = (prefix + 1) << 1;
    return this.readBits(width);
  }

  /** class_279.method_2533 */
  readPackedU24(): number {
    return this.readPacked(3);
  }

  /** class_279.method_8152 (read of method_8359) */
  readPackedU32(): number {
    return this.readPacked(4);
  }
}

export const packedU32BitLength = bitLength;
