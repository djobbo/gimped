export const rotr = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0;

export class ByteReader {
  constructor(
    private readonly buf: Uint8Array,
    private offset = 0,
  ) {}

  get remaining(): number {
    return this.buf.length - this.offset;
  }

  readU8(): number {
    if (this.offset >= this.buf.length) throw new RangeError("EOF");
    return this.buf[this.offset++]!;
  }

  readU32BE(): number {
    return (
      ((this.readU8() << 24) | (this.readU8() << 16) | (this.readU8() << 8) | this.readU8()) >>> 0
    );
  }
}

export class ByteWriter {
  private readonly parts: number[] = [];

  writeU8(v: number): void {
    this.parts.push(v & 0xff);
  }

  writeU32BE(v: number): void {
    const x = v >>> 0;
    this.writeU8((x >>> 24) & 0xff);
    this.writeU8((x >>> 16) & 0xff);
    this.writeU8((x >>> 8) & 0xff);
    this.writeU8(x & 0xff);
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.parts);
  }
}
