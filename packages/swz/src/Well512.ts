export class Well512 {
  private state = new Uint32Array(16);
  private stateIndex = 0;

  initState(seed: number): void {
    const s = seed >>> 0;
    this.state[0] = s;
    this.stateIndex = 0;
    for (let i = 1; i < 16; i++) {
      const previous = this.state[i - 1]!;
      const modified = previous ^ (previous >>> 30);
      this.state[i] = (i + Math.imul(1812433253, modified)) >>> 0;
    }
  }

  next(): number {
    const a = this.state[this.stateIndex]!;
    const b = this.state[(this.stateIndex - 3) & 0xf]!;
    const c = (a ^ b ^ ((b ^ Math.imul(2, a)) << 15)) >>> 0;
    const e = this.state[(this.stateIndex - 7) & 0xf]!;
    const d = ((e >>> 11) ^ e) >>> 0;
    const newIndex = (this.stateIndex - 1) & 0xf;
    this.state[this.stateIndex] = (d ^ c) >>> 0;
    this.state[newIndex] =
      (this.state[newIndex]! ^
        d ^
        Math.imul(32, (d ^ c) & 0xfed22169) ^
        Math.imul(4, this.state[newIndex]! ^ ((c ^ (d << 10)) << 16))) >>>
      0;
    this.stateIndex = newIndex;
    return this.state[newIndex]! >>> 0;
  }
}
