export class ByteReader {
  private pos: number;

  constructor(
    private readonly buf: Uint8Array,
    offset = 0,
  ) {
    this.pos = offset;
  }

  get remaining(): number {
    return this.buf.length - this.pos;
  }

  get offset(): number {
    return this.pos;
  }

  readU8(): number {
    if (this.pos >= this.buf.length) throw new RangeError("EOF");
    return this.buf[this.pos++]!;
  }

  readU16BE(): number {
    return ((this.readU8() << 8) | this.readU8()) >>> 0;
  }

  readU32BE(): number {
    return (
      ((this.readU8() << 24) | (this.readU8() << 16) | (this.readU8() << 8) | this.readU8()) >>> 0
    );
  }

  readU16LE(): number {
    return (this.readU8() | (this.readU8() << 8)) >>> 0;
  }

  readU32LE(): number {
    return (
      (this.readU8() | (this.readU8() << 8) | (this.readU8() << 16) | (this.readU8() << 24)) >>> 0
    );
  }

  readI8(): number {
    const u = this.readU8();
    return u > 127 ? u - 256 : u;
  }

  readI16LE(): number {
    const u = this.readU16LE();
    return u > 32767 ? u - 65536 : u;
  }

  readF32LE(): number {
    const view = new DataView(this.readBytes(4).buffer);
    return view.getFloat32(0, true);
  }

  readF64LE(): number {
    const view = new DataView(this.readBytes(8).buffer);
    return view.getFloat64(0, true);
  }

  readBool(): boolean {
    return this.readU8() !== 0;
  }

  readBytes(n: number): Uint8Array {
    if (n < 0 || this.pos + n > this.buf.length) throw new RangeError("EOF");
    const slice = this.buf.slice(this.pos, this.pos + n);
    this.pos += n;
    return slice;
  }

  readUTFLE(): string {
    const length = this.readU16LE();
    return new TextDecoder().decode(this.readBytes(length));
  }
}

export class ByteWriter {
  private readonly parts: number[] = [];

  writeU8(v: number): void {
    this.parts.push(v & 0xff);
  }

  writeU16BE(v: number): void {
    const x = v >>> 0;
    this.writeU8((x >>> 8) & 0xff);
    this.writeU8(x & 0xff);
  }

  writeU32BE(v: number): void {
    const x = v >>> 0;
    this.writeU8((x >>> 24) & 0xff);
    this.writeU8((x >>> 16) & 0xff);
    this.writeU8((x >>> 8) & 0xff);
    this.writeU8(x & 0xff);
  }

  writeU16LE(v: number): void {
    const x = v >>> 0;
    this.writeU8(x & 0xff);
    this.writeU8((x >>> 8) & 0xff);
  }

  writeU32LE(v: number): void {
    const x = v >>> 0;
    this.writeU8(x & 0xff);
    this.writeU8((x >>> 8) & 0xff);
    this.writeU8((x >>> 16) & 0xff);
    this.writeU8((x >>> 24) & 0xff);
  }

  writeI8(v: number): void {
    this.writeU8(v);
  }

  writeI16LE(v: number): void {
    this.writeU16LE(v);
  }

  writeF32LE(v: number): void {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, v, true);
    this.writeBytes(new Uint8Array(buf));
  }

  writeF64LE(v: number): void {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, v, true);
    this.writeBytes(new Uint8Array(buf));
  }

  writeBool(v: boolean): void {
    this.writeU8(v ? 1 : 0);
  }

  writeBytes(bytes: Uint8Array): void {
    for (const b of bytes) this.writeU8(b);
  }

  writeUTFLE(s: string): void {
    const encoded = new TextEncoder().encode(s);
    if (encoded.byteLength > 65535) throw new RangeError("UTF exceeds 65535 bytes");
    this.writeU16LE(encoded.byteLength);
    this.writeBytes(encoded);
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.parts);
  }
}
