const mask = (n: number): number => (n >= 32 ? 0xffffffff : ((1 << n) - 1) >>> 0);

export class Bitstream {
  private bytes: number[];
  private writePos = 0;
  private readPos = 0;

  constructor(input?: Uint8Array) {
    this.bytes = input ? [...input] : [];
    this.writePos = input ? input.length * 8 : 0;
  }

  get remainingBits(): number {
    return this.writePos - this.readPos;
  }

  writeBits(n: number, value: number): void {
    let remaining = n >>> 0;
    const v = value >>> 0;
    while (remaining !== 0) {
      const byteIndex = this.writePos >>> 3;
      const bitOffset = this.writePos & 7;
      const space = 8 - bitOffset;
      const take = remaining < space ? remaining : space;
      const extracted = (v & mask(remaining)) >>> (remaining - take);
      while (this.bytes.length <= byteIndex) this.bytes.push(0);
      this.bytes[byteIndex] = this.bytes[byteIndex]! | (extracted << (space - take));
      remaining -= take;
      this.writePos += take;
    }
  }

  readBits(n: number): number {
    let remaining = n >>> 0;
    let out = 0;
    while (remaining !== 0) {
      const byteIndex = this.readPos >>> 3;
      if (byteIndex >= this.bytes.length) throw new RangeError("EOF");
      const bitOffset = this.readPos & 7;
      const space = 8 - bitOffset;
      const take = remaining < space ? remaining : space;
      const extracted = (this.bytes[byteIndex]! & mask(space)) >>> (space - take);
      out |= extracted << (remaining - take);
      remaining -= take;
      this.readPos += take;
    }
    return out >>> 0;
  }

  private writeBytes(data: Uint8Array): void {
    const bitOffset = this.writePos & 7;
    if (bitOffset === 0) {
      for (const b of data) {
        const i = this.writePos >>> 3;
        while (this.bytes.length <= i) this.bytes.push(0);
        this.bytes[i] = b;
        this.writePos += 8;
      }
      return;
    }
    const left = 8 - bitOffset;
    for (const b of data) {
      const i = this.writePos >>> 3;
      while (this.bytes.length <= i + 1) this.bytes.push(0);
      this.bytes[i] = this.bytes[i]! | (b >>> bitOffset);
      this.bytes[i + 1] = this.bytes[i + 1]! | ((b << left) & 0xff);
      this.writePos += 8;
    }
  }

  private readBytes(count: number): Uint8Array {
    const out = new Uint8Array(count);
    const bitOffset = this.readPos & 7;
    if (bitOffset === 0) {
      for (let i = 0; i < count; i++) {
        const idx = this.readPos >>> 3;
        if (idx >= this.bytes.length) throw new RangeError("EOF");
        out[i] = this.bytes[idx]!;
        this.readPos += 8;
      }
      return out;
    }
    const left = 8 - bitOffset;
    for (let i = 0; i < count; i++) {
      const idx = this.readPos >>> 3;
      if (idx >= this.bytes.length) throw new RangeError("EOF");
      out[i] = ((this.bytes[idx]! << bitOffset) | (this.bytes[idx + 1]! >>> left)) & 0xff;
      this.readPos += 8;
    }
    return out;
  }

  writeU32(value: number): void {
    const w = new Uint8Array(4);
    const x = value >>> 0;
    w[0] = (x >>> 24) & 0xff;
    w[1] = (x >>> 16) & 0xff;
    w[2] = (x >>> 8) & 0xff;
    w[3] = x & 0xff;
    this.writeBytes(w);
  }

  readU32(): number {
    const b = this.readBytes(4);
    return ((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) >>> 0;
  }

  writeU16(value: number): void {
    const w = new Uint8Array(2);
    const x = value >>> 0;
    w[0] = (x >>> 8) & 0xff;
    w[1] = x & 0xff;
    this.writeBytes(w);
  }

  readU16(): number {
    const b = this.readBytes(2);
    return ((b[0]! << 8) | b[1]!) >>> 0;
  }

  writeString(value: string): void {
    const utf8 = new TextEncoder().encode(value);
    const len = Math.min(utf8.length, 65535);
    this.writeU16(len);
    this.writeBytes(utf8.subarray(0, len));
  }

  readString(): string {
    const len = this.readU16();
    return new TextDecoder("utf-8").decode(this.readBytes(len));
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}
