# Replay Decompile/Recompile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `@gimped/common` from SWZ, then add `@gimped/replay` + `@gimped/replay-cli` that decompile/recompile Brawlhalla `.replay` files to Schema-validated JSON.

**Architecture:** Shared IO/binary primitives live in `@gimped/common`. Replay envelope is zlib+XOR; payload is an MSB-first bitstream of version + 4-bit chunks. `ReplayJson` Schema is the JSON boundary both ways. Optional `--data` fills name annotations; compile ignores them and recomputes the player checksum.

**Tech Stack:** Effect `4.0.0-beta.107`, `@effect/platform-node` catalog, Vitest via Vite+ (`vp test`), Node zlib, `fast-xml-parser` (via `@gimped/swz` `xmlToJson` for `--data`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-replay-codec-design.md`
- Effect style: `Effect.fn("Name")` + `Effect.gen`; services via `Context.Service` + `static layer`; errors via `Schema.TaggedError`
- No `node:fs` in library packages (use `FileSystem` / `Path`)
- JSON names: `Schema.optionalKey`; compile ignores them; IDs are authoritative
- Semantic round-trip: decompile → compile → decompile is Schema-equal without names
- Replay `ChecksumMismatch` tag is `"ChecksumMismatch"` with `{ expected, actual }` (not SWZ’s `where`)
- No copyrighted `.replay` fixtures; synthetic only
- Prefer TDD: failing test → implement → pass → commit per task

## File structure

| File | Role |
| ---- | ---- |
| `packages/common/package.json` | `@gimped/common` |
| `packages/common/src/binary.ts` | `ByteReader` / `ByteWriter` (+ U16BE) |
| `packages/common/src/errors.ts` | `IoError`, `MalformedJson`, `toIoError`, `toMalformedJson` |
| `packages/common/src/test-utils.ts` | `runWith` |
| `packages/common/src/index.ts` | Re-exports |
| `packages/swz/src/errors.ts` | Re-export common errors; keep SWZ-only errors |
| `packages/swz/src/binary.ts` | Re-export common readers; keep `rotr` |
| `packages/swz/src/test-utils.ts` | Re-export `runWith` from common |
| `packages/replay/src/xor.ts` | 64-byte XOR |
| `packages/replay/src/bitstream.ts` | `class_30` bit reader/writer |
| `packages/replay/src/checksum.ts` | `method_3796` |
| `packages/replay/src/ReplayJson.ts` | Effect Schema for the JSON document |
| `packages/replay/src/errors.ts` | `InvalidReplay`, `ChecksumMismatch`, `GameDataError` |
| `packages/replay/src/Envelope.ts` | zlib + XOR + raw fallback |
| `packages/replay/src/ReplayCodec.ts` | bitstream ↔ `ReplayJson` type |
| `packages/replay/src/GameData.ts` | optional ID→name |
| `packages/replay/src/pipeline.ts` | `decompileFile` / `compileFile` |
| `packages/replay/src/layers.ts` | `TestLive` |
| `packages/replay-cli/src/*` | `replay` CLI |

---

### Task 1: Scaffold `@gimped/common` with ByteReader/Writer

**Files:**
- Create: `packages/common/package.json`
- Create: `packages/common/tsconfig.json`
- Create: `packages/common/vite.config.ts`
- Create: `packages/common/src/binary.ts`
- Create: `packages/common/src/binary.test.ts`
- Create: `packages/common/src/index.ts`
- Modify: `tsconfig.json` (add common reference)
- Modify: `packages/swz/package.json` (add `"@gimped/common": "workspace:*"`)

**Interfaces:**
- Produces:
  - `class ByteReader { constructor(buf: Uint8Array, offset?: number); remaining: number; readU8(): number; readU16BE(): number; readU32BE(): number }`
  - `class ByteWriter { writeU8(v: number): void; writeU16BE(v: number): void; writeU32BE(v: number): void; toUint8Array(): Uint8Array }`

- [ ] **Step 1: Scaffold the package**

`packages/common/package.json`:

```json
{
  "name": "@gimped/common",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vp test",
    "build": "vp build",
    "check": "vp check"
  },
  "dependencies": {
    "effect": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vite-plus": "catalog:"
  }
}
```

Copy `tsconfig.json` and `vite.config.ts` from `packages/swz/` (same compiler options and `src/**/*.test.ts`).

`packages/common/src/index.ts`:

```ts
export * from "./binary.ts";
```

Add `"@gimped/common": "workspace:*"` to `packages/swz/package.json` dependencies.

Root `tsconfig.json` references:

```json
"references": [
  { "path": "./packages/common" },
  { "path": "./packages/swz" },
  { "path": "./packages/swz-cli" }
]
```

Run: `pnpm install`

Expected: lockfile updates; `@gimped/common` is a workspace package.

- [ ] **Step 2: Write the failing test**

Create `packages/common/src/binary.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { ByteReader, ByteWriter } from "./binary.ts";

describe("ByteReader / ByteWriter", () => {
  it("round-trips u8, u16BE, and u32BE", () => {
    const writer = new ByteWriter();
    writer.writeU8(0xab);
    writer.writeU16BE(0x1234);
    writer.writeU32BE(0xdeadbeef);
    const bytes = writer.toUint8Array();
    expect([...bytes]).toEqual([0xab, 0x12, 0x34, 0xde, 0xad, 0xbe, 0xef]);

    const reader = new ByteReader(bytes);
    expect(reader.readU8()).toBe(0xab);
    expect(reader.readU16BE()).toBe(0x1234);
    expect(reader.readU32BE()).toBe(0xdeadbeef);
    expect(reader.remaining).toBe(0);
  });

  it("throws RangeError on EOF", () => {
    const reader = new ByteReader(new Uint8Array([1]));
    expect(reader.readU8()).toBe(1);
    expect(() => reader.readU8()).toThrow(RangeError);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @gimped/common exec vp test src/binary.test.ts`

Expected: FAIL (module missing)

- [ ] **Step 4: Implement ByteReader / ByteWriter**

Create `packages/common/src/binary.ts` by moving the SWZ classes and adding U16:

```ts
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

  readU16BE(): number {
    return ((this.readU8() << 8) | this.readU8()) >>> 0;
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

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.parts);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @gimped/common exec vp test src/binary.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/common packages/swz/package.json tsconfig.json pnpm-lock.yaml
git commit -m "feat(common): add ByteReader/ByteWriter with U16BE"
```

---

### Task 2: Move IoError, MalformedJson, helpers, and runWith

**Files:**
- Create: `packages/common/src/errors.ts`
- Create: `packages/common/src/errors.test.ts`
- Create: `packages/common/src/test-utils.ts`
- Modify: `packages/common/src/index.ts`
- Modify: `packages/swz/src/errors.ts`
- Modify: `packages/swz/src/binary.ts`
- Modify: `packages/swz/src/test-utils.ts`
- Modify: `packages/swz/src/EntryIo.ts` (import `toIoError` from common)
- Modify: `packages/swz/src/JsonTranspile.ts` (import helpers from common)
- Modify: `packages/swz/src/pipeline.ts` (import `toIoError` from common)

**Interfaces:**
- Consumes: `ByteReader` / `ByteWriter` from Task 1
- Produces:
  - `new IoError({ path: string, message: string })`
  - `new MalformedJson({ path: string, message: string })`
  - `toIoError(path: string, error: unknown): IoError`
  - `toMalformedJson(path: string, error: unknown): MalformedJson`
  - `runWith(layer)(effect): Promise<A>`

- [ ] **Step 1: Write the failing test**

Create `packages/common/src/errors.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { IoError, MalformedJson, toIoError, toMalformedJson } from "./errors.ts";

describe("common errors", () => {
  it("constructs IoError and MalformedJson", () => {
    const io = new IoError({ path: "/a", message: "nope" });
    const json = new MalformedJson({ path: "/b.json", message: "bad" });
    expect(io._tag).toBe("IoError");
    expect(json._tag).toBe("MalformedJson");
  });

  it("maps unknown values to IoError / MalformedJson", () => {
    const io = toIoError("/x", new Error("boom"));
    expect(io.path).toBe("/x");
    expect(io.message).toBe("boom");
    const json = toMalformedJson("/y", "not json");
    expect(json.path).toBe("/y");
    expect(json.message).toBe("not json");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gimped/common exec vp test src/errors.test.ts`

Expected: FAIL (exports missing)

- [ ] **Step 3: Implement errors and runWith; rewire SWZ**

`packages/common/src/errors.ts`:

```ts
import { Schema } from "effect";

export class IoError extends Schema.TaggedError<IoError>()("IoError", {
  path: Schema.String,
  message: Schema.String,
}) {}

export class MalformedJson extends Schema.TaggedError<MalformedJson>()("MalformedJson", {
  path: Schema.String,
  message: Schema.String,
}) {}

export const toIoError = (path: string, error: unknown): IoError =>
  new IoError({
    path,
    message: error instanceof Error ? error.message : String(error),
  });

export const toMalformedJson = (path: string, error: unknown): MalformedJson =>
  new MalformedJson({
    path,
    message: error instanceof Error ? error.message : String(error),
  });
```

`packages/common/src/test-utils.ts` — copy `runWith` from `packages/swz/src/test-utils.ts` unchanged.

`packages/common/src/index.ts`:

```ts
export * from "./binary.ts";
export * from "./errors.ts";
export * from "./test-utils.ts";
```

`packages/swz/src/errors.ts` — delete `IoError` and `MalformedJson` class bodies; add:

```ts
export { IoError, MalformedJson } from "@gimped/common";
```

Keep `ChecksumMismatch`, `InvalidSwz`, `UnknownVersion`, `MissingRegistry`, `MalformedCsv`, `MalformedXml`.

`packages/swz/src/binary.ts`:

```ts
export { ByteReader, ByteWriter } from "@gimped/common";

export const rotr = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0;
```

`packages/swz/src/test-utils.ts`:

```ts
export { runWith } from "@gimped/common";
```

In `EntryIo.ts`, `JsonTranspile.ts`, and `pipeline.ts`: delete local `toIoError` / `toMalformedJson` and import them from `@gimped/common`.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @gimped/common exec vp test`

Run: `pnpm --filter @gimped/swz exec vp test`

Expected: PASS (SWZ behavior unchanged)

- [ ] **Step 5: Commit**

```bash
git add packages/common packages/swz
git commit -m "refactor(swz): move shared errors and helpers into @gimped/common"
```

---

### Task 3: Scaffold `@gimped/replay`

**Files:**
- Create: `packages/replay/package.json`
- Create: `packages/replay/tsconfig.json`
- Create: `packages/replay/vite.config.ts`
- Create: `packages/replay/src/index.ts`
- Create: `packages/replay/src/errors.ts`
- Create: `packages/replay/src/errors.test.ts`
- Modify: `tsconfig.json` (add replay reference)

**Interfaces:**
- Produces:
  - `new InvalidReplay({ reason: string })`
  - `new ChecksumMismatch({ expected: number, actual: number })`
  - `new GameDataError({ path: string, message: string })`

- [ ] **Step 1: Scaffold**

`packages/replay/package.json`:

```json
{
  "name": "@gimped/replay",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vp test",
    "build": "vp build",
    "check": "vp check"
  },
  "dependencies": {
    "@gimped/common": "workspace:*",
    "@gimped/swz": "workspace:*",
    "effect": "catalog:"
  },
  "devDependencies": {
    "@effect/platform-node": "catalog:",
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vite-plus": "catalog:"
  }
}
```

Copy tsconfig/vite.config from `packages/swz/`. `src/index.ts` starts as `export * from "./errors.ts"`. Add root tsconfig reference. Run `pnpm install`.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from "vite-plus/test";
import { ChecksumMismatch, GameDataError, InvalidReplay } from "./errors.ts";

describe("replay errors", () => {
  it("constructs tagged errors", () => {
    const invalid = new InvalidReplay({ reason: "chunk 8" });
    const checksum = new ChecksumMismatch({ expected: 1, actual: 2 });
    const data = new GameDataError({ path: "/x", message: "missing" });
    expect(invalid._tag).toBe("InvalidReplay");
    expect(checksum._tag).toBe("ChecksumMismatch");
    expect(checksum.expected).toBe(1);
    expect(data._tag).toBe("GameDataError");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @gimped/replay exec vp test src/errors.test.ts`

Expected: FAIL

- [ ] **Step 4: Implement errors**

```ts
import { Schema } from "effect";

export class InvalidReplay extends Schema.TaggedError<InvalidReplay>()("InvalidReplay", {
  reason: Schema.String,
}) {}

export class ChecksumMismatch extends Schema.TaggedError<ChecksumMismatch>()("ChecksumMismatch", {
  expected: Schema.Number,
  actual: Schema.Number,
}) {}

export class GameDataError extends Schema.TaggedError<GameDataError>()("GameDataError", {
  path: Schema.String,
  message: Schema.String,
}) {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @gimped/replay exec vp test src/errors.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/replay tsconfig.json pnpm-lock.yaml
git commit -m "feat(replay): scaffold package and tagged errors"
```

---

### Task 4: XOR

**Files:**
- Create: `packages/replay/src/xor.ts`
- Create: `packages/replay/src/xor.test.ts`
- Modify: `packages/replay/src/index.ts`

**Interfaces:**
- Produces: `xorBytes(bytes: Uint8Array): Uint8Array` — in-place-safe copy; `out[i] = in[i] ^ KEY[i % 64]`
- Key (64 bytes): `107,16,222,60,68,75,209,70,160,16,82,193,178,49,211,106,251,172,17,222,6,104,8,120,140,213,179,249,106,64,214,19,12,174,157,197,212,107,84,114,252,87,93,26,6,115,194,81,75,176,201,140,120,4,17,122,239,116,62,70,57,160,199,166`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vite-plus/test";
import { xorBytes } from "./xor.ts";

describe("xorBytes", () => {
  it("is symmetric and uses key[i % 64]", () => {
    const input = Uint8Array.from({ length: 70 }, (_, i) => i);
    const once = xorBytes(input);
    expect(once[0]).toBe(0 ^ 107);
    expect(once[64]).toBe(64 ^ 107);
    expect([...xorBytes(once)]).toEqual([...input]);
    expect([...input]).toEqual([...Uint8Array.from({ length: 70 }, (_, i) => i)]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gimped/replay exec vp test src/xor.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

```ts
export const XOR_KEY = Uint8Array.from([
  107, 16, 222, 60, 68, 75, 209, 70, 160, 16, 82, 193, 178, 49, 211, 106, 251, 172, 17, 222, 6, 104,
  8, 120, 140, 213, 179, 249, 106, 64, 214, 19, 12, 174, 157, 197, 212, 107, 84, 114, 252, 87, 93,
  26, 6, 115, 194, 81, 75, 176, 201, 140, 120, 4, 17, 122, 239, 116, 62, 70, 57, 160, 199, 166,
]);

export const xorBytes = (bytes: Uint8Array): Uint8Array => {
  const out = new Uint8Array(bytes.length);
  const n = XOR_KEY.length;
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i]! ^ XOR_KEY[i % n]!;
  }
  return out;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gimped/replay exec vp test src/xor.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/replay/src/xor.ts packages/replay/src/xor.test.ts packages/replay/src/index.ts
git commit -m "feat(replay): add 64-byte XOR key transform"
```

---

### Task 5: Bitstream

**Files:**
- Create: `packages/replay/src/bitstream.ts`
- Create: `packages/replay/src/bitstream.test.ts`

**Interfaces:**
- Produces: `class Bitstream`
  - `constructor(bytes?: Uint8Array)`
  - `writeBits(n: number, value: number): void`
  - `readBits(n: number): number`
  - `writeU32(value: number): void` / `readU32(): number`
  - `writeU16(value: number): void` / `readU16(): number`
  - `writeString(value: string): void` / `readString(): string`
  - `remainingBits: number`
  - `toUint8Array(): Uint8Array`
- Masks: `(1 << k) - 1` for `k` in 0..31; `0xffffffff` for 32
- MSB-first packing matching `class_30.method_4003` / `method_5520`
- `u32`/`u16` are big-endian bytes copied into the bit stream (`method_5866` / `method_1791`)
- `string`: `u16` UTF-8 length (cap 65535) + bytes
- `readBits` throws `RangeError` on EOF

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vite-plus/test";
import { Bitstream } from "./bitstream.ts";

describe("Bitstream", () => {
  it("packs 4-bit values MSB-first into one byte", () => {
    const w = new Bitstream();
    w.writeBits(4, 3);
    w.writeBits(4, 2);
    expect([...w.toUint8Array()]).toEqual([0x32]);
    const r = new Bitstream(w.toUint8Array());
    expect(r.readBits(4)).toBe(3);
    expect(r.readBits(4)).toBe(2);
  });

  it("round-trips u32, u16, and string from a byte-aligned start", () => {
    const w = new Bitstream();
    w.writeU32(268);
    w.writeU16(3);
    w.writeString("hi");
    const r = new Bitstream(w.toUint8Array());
    expect(r.readU32()).toBe(268);
    expect(r.readU16()).toBe(3);
    expect(r.readString()).toBe("hi");
  });

  it("round-trips u32 after a 4-bit write (unaligned)", () => {
    const w = new Bitstream();
    w.writeBits(4, 4);
    w.writeU32(0xaabbccdd);
    const r = new Bitstream(w.toUint8Array());
    expect(r.readBits(4)).toBe(4);
    expect(r.readU32()).toBe(0xaabbccdd);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gimped/replay exec vp test src/bitstream.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement `Bitstream`**

Match `dumps/scripts/class_30.as`:

```ts
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

  writeBytes(data: Uint8Array): void {
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

  readBytes(count: number): Uint8Array {
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
      if (idx + 1 >= this.bytes.length && idx >= this.bytes.length) throw new RangeError("EOF");
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gimped/replay exec vp test src/bitstream.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/replay/src/bitstream.ts packages/replay/src/bitstream.test.ts
git commit -m "feat(replay): add class_30 MSB-first bitstream"
```

---

### Task 6: Player checksum

**Files:**
- Create: `packages/replay/src/checksum.ts`
- Create: `packages/replay/src/checksum.test.ts`

**Interfaces:**
- Consumes: player/cosmetics/heroes field names from spec JSON
- Produces: `playerChecksum(players: readonly PlayerChecksumInput[], levelId: number, heroSlotCount: number): number`
- Formula (`class_314.method_3796`), then `% 173`
- Bitfield contribution: for each index `i`, `popcount(bitfield[i]) * (11 + i)` (`class_29.method_8237(11)` + `class_86.method_1496`)
- Null handicap adds `29`; present handicap uses `lives * 31 + round(statA/10)*3 + round(statB/10)*23`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vite-plus/test";
import { playerChecksum, type ChecksumPlayer } from "./checksum.ts";

const player = (over: Partial<ChecksumPlayer> = {}): ChecksumPlayer => ({
  colorSchemeId: 1,
  heroes: [{ heroId: 0, costumeId: 0, field3172: 0, weaponSkinId: 0 }],
  cosmetics: {
    spawnBotId: 0,
    field2463: 0,
    field11747: 0,
    tauntIds: [0, 0, 0, 0, 0, 0, 0, 0],
    field2378: 0,
    field15047: 0,
    bitfield: [],
    field3535: 0,
  },
  ...over,
});

describe("playerChecksum", () => {
  it("matches colorSchemeId*5 + null handicap 29, mod 173", () => {
    expect(playerChecksum([player()], 0, 1)).toBe(34);
  });

  it("includes levelId * 47", () => {
    expect(playerChecksum([player()], 2, 1)).toBe((34 + 94) % 173);
  });
});
```

Define `ChecksumPlayer` in `checksum.ts` (Task 7 `Player` is not required here).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gimped/replay exec vp test src/checksum.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

```ts
export type ChecksumHero = {
  readonly heroId: number;
  readonly costumeId: number;
  readonly field3172: number;
  readonly weaponSkinId: number;
};

export type ChecksumPlayer = {
  readonly colorSchemeId: number;
  readonly cosmetics: {
    readonly spawnBotId: number;
    readonly field2463: number;
    readonly field11747: number;
    readonly tauntIds: readonly number[];
    readonly field2378: number;
    readonly field15047: number;
    readonly bitfield: readonly number[];
    readonly field3535: number;
  };
  readonly heroes: readonly ChecksumHero[];
  readonly handicap?: { readonly lives: number; readonly statA: number; readonly statB: number };
};

const popcount = (x: number): number => {
  let n = x >>> 0;
  n -= (n >>> 1) & 0x55555555;
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

export const playerChecksum = (
  players: readonly ChecksumPlayer[],
  levelId: number,
  heroSlotCount: number,
): number => {
  let sum = 0;
  for (const player of players) {
    if (player == null) continue;
    const c = player.cosmetics;
    sum += player.colorSchemeId * 5;
    sum += c.spawnBotId * 93;
    sum += c.field2463 * 97;
    sum += c.field11747 * 53;
    for (let i = 0; i < 8; i++) sum += (c.tauntIds[i] ?? 0) * (13 + i);
    sum += c.field2378 * 37;
    sum += c.field15047 * 41;
    for (let i = 0; i < c.bitfield.length; i++) sum += (11 + i) * popcount(c.bitfield[i]!);
    sum += c.field3535 * 43;
    for (let i = 0; i < heroSlotCount; i++) {
      const hero = player.heroes[i];
      if (!hero) continue;
      sum += (hero.heroId & 65535) * (17 + i);
      sum += hero.costumeId * (7 + i);
      sum += hero.field3172 * (3 + i);
      sum += hero.weaponSkinId * (2 + i);
    }
    if (player.handicap == null) sum += 29;
    else {
      sum += player.handicap.lives * 31;
      sum += Math.round(player.handicap.statA / 10) * 3;
      sum += Math.round(player.handicap.statB / 10) * 23;
    }
  }
  sum += levelId * 47;
  return sum % 173;
};
```

The test already imports `ChecksumPlayer`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gimped/replay exec vp test src/checksum.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/replay/src/checksum.ts packages/replay/src/checksum.test.ts
git commit -m "feat(replay): add player setup checksum"
```

---

### Task 7: `ReplayJson` Schema

**Files:**
- Create: `packages/replay/src/ReplayJson.ts`
- Create: `packages/replay/src/ReplayJson.test.ts`

**Interfaces:**
- Produces: `ReplayJson` Schema; `type Replay = typeof ReplayJson.Type`
- Optional name keys via `Schema.optionalKey(Schema.String)`: `game.nameKey`, `rules.scoringTypeName`, `level.name`, `player.colorSchemeName`, `hero.heroName`, `hero.costumeName`
- `input` on input rows: `Schema.optionalKey(Schema.Number)`
- `handicap`: `Schema.optionalKey(Handicap)`
- `tauntIds`: 8-tuple of `Schema.Number`
- Encode omits missing optional keys; decode accepts them

- [ ] **Step 1: Write the failing test**

```ts
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { ReplayJson, type Replay } from "./ReplayJson.ts";

const minimal = (): Replay => ({
  replayVersion: 268,
  game: { id: 1, nameId: 0, customOnline: false },
  rules: {
    flags: 0,
    maxPlayers: 4,
    duration: 480,
    roundDuration: 0,
    startingLives: 3,
    scoringTypeId: 1,
    scoreToWin: 0,
    gameSpeed: 100,
    damageRatio: 100,
    levelSetId: 0,
    itemSpawnRuleSetId: 0,
    weaponSpawnRateId: 0,
    gadgetSpawnRateId: 0,
    unknown12964: 0,
    variation: 0,
  },
  level: { id: 12 },
  heroSlotCount: 1,
  players: [
    {
      entityId: 1,
      team: 1,
      name: "A",
      colorSchemeId: 0,
      heroes: [{ heroId: 3, costumeId: 0, field3172: 0, weaponSkinId: 0 }],
      cosmetics: {
        spawnBotId: 0,
        companionId: 0,
        field2463: 0,
        field8849: 0,
        field11747: 0,
        tauntIds: [0, 0, 0, 0, 0, 0, 0, 0],
        field2378: 0,
        field15047: 0,
        bitfield: [],
        field4335: 0,
        field3535: 0,
        field6575: 0,
      },
      hidden: false,
    },
  ],
  results: { duration: 100, scores: [], endValue: 1 },
  inputs: [{ entityId: 1, time: 16 }],
  events: [],
  otherEvents: [],
});

describe("ReplayJson", () => {
  it("round-trips a document without name keys", async () => {
    const encoded = await Effect.runPromise(Schema.encodeUnknownEffect(ReplayJson)(minimal()));
    expect(encoded).not.toHaveProperty("level.name");
    const decoded = await Effect.runPromise(Schema.decodeUnknownEffect(ReplayJson)(encoded));
    expect(decoded.level.id).toBe(12);
    expect(decoded.level.name).toBeUndefined();
    expect(decoded.inputs[0]?.input).toBeUndefined();
  });

  it("rejects missing replayVersion", async () => {
    const result = await Effect.runPromise(
      Effect.result(Schema.decodeUnknownEffect(ReplayJson)({ ...minimal(), replayVersion: undefined })),
    );
    expect(result._tag).toBe("Failure");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gimped/replay exec vp test src/ReplayJson.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement Schema structs**

Use `Schema.Struct` for `Game`, `Rules`, `Level`, `Hero`, `Cosmetics`, `Handicap`, `Player`, `Score`, `Input`, `EntityEvent`, `Results`, `ReplayJson`.

`tauntIds: Schema.Tuple([Schema.Number, Schema.Number, Schema.Number, Schema.Number, Schema.Number, Schema.Number, Schema.Number, Schema.Number])`

Optional keys: `Schema.optionalKey(Schema.String)` / `Schema.optionalKey(Schema.Number)` / `Schema.optionalKey(Handicap)`.

Export `export type Replay = typeof ReplayJson.Type`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gimped/replay exec vp test src/ReplayJson.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/replay/src/ReplayJson.ts packages/replay/src/ReplayJson.test.ts
git commit -m "feat(replay): add ReplayJson Schema"
```

---

### Task 8: ReplayCodec (chunks)

**Files:**
- Create: `packages/replay/src/ReplayCodec.ts`
- Create: `packages/replay/src/ReplayCodec.test.ts`
- Create: `packages/replay/src/layers.ts` (codec layer only for now)

**Interfaces:**
- Consumes: `Bitstream`, `playerChecksum`, `Replay`, `InvalidReplay`, `ChecksumMismatch`
- Produces: `ReplayCodec` service `"@gimped/replay/ReplayCodec"`
  - `decode(bytes: Uint8Array): Effect<Replay, InvalidReplay | ChecksumMismatch>`
  - `encode(replay: Replay): Effect<Uint8Array>`
- Write order: `u32` version, chunks **3, 4, 6, 1, 5, 7, 2**
- Read: while `remainingBits >= 4`, read 4-bit type; type 2 breaks; type 8 fails; unknown type breaks; after loop, missing `rules`/`level`/`players` → `InvalidReplay`
- `heroSlotCount > 5` → `InvalidReplay`
- Verify checksum on decode; encode recomputes (does not read a JSON field)

Chunk layouts are in the spec. Implement `readPlayer` / `writePlayer` exactly as listed (entityId u32, team u32, name string, colorSchemeId u32, cosmetics fields, heroes × heroSlotCount, hidden bit, handicap bit).

- [ ] **Step 1: Write the failing test**

Copy the `minimal()` object from `ReplayJson.test.ts` into this file. Tests:

1. `encode(minimal())` then `decode` → `toEqual(minimal())`
2. Same with `inputs: [{ entityId: 1, time: 16, input: 512 }]`
3. `encode` then corrupt the bitstream checksum u32 (last u32 of chunk 4) → `decode` fails with `ChecksumMismatch`
4. Build a `Bitstream`: `writeU32(268)`, `writeBits(4, 4)`, fifteen `writeU32(0)`, `writeU32(1)` (level), `writeU16(6)` (heroSlotCount) → `decode` fails with `InvalidReplay` reason mentioning hero slots

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gimped/replay exec vp test src/ReplayCodec.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement encode/decode**

`ReplayCodec.layer = Layer.effect(ReplayCodec, Effect.gen(...))` returning `ReplayCodec.of({ decode, encode })` with `Effect.fn("ReplayCodec.decode")` / `encode`.

Map `RangeError` from `Bitstream` to `new InvalidReplay({ reason: "truncated" })`.

Type 3: `writeU32(id); writeU32(nameId); if nameId !== 0 writeString(nameKey ?? ""); writeBits(1, customOnline ? 1 : 0)`. On read, if nameId !== 0, `nameKey = readString()`.

Type 4 rules: 15 u32s in spec order (`flags` … `variation`).

Type 6: duration u32; if `scores.length === 0` write bits(1)=0; else bits(1)=1 then each score as bits(1)=1, entity 5 bits, score u16, then bits(1)=0; then endValue u32.

Type 1: per distinct entityId in `inputs`, bits(1)=1, entity 5 bits, count u32, rows; then bits(1)=0. Preserve input array order grouped by entity (group while encoding).

Type 5/7: bits(1)=1, entity 5 bits, time u32, until 0.

Type 2: `writeBits(4, 2)` only.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gimped/replay exec vp test src/ReplayCodec.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/replay/src/ReplayCodec.ts packages/replay/src/ReplayCodec.test.ts packages/replay/src/layers.ts packages/replay/src/index.ts
git commit -m "feat(replay): encode and decode replay chunks"
```

---

### Task 9: Envelope

**Files:**
- Create: `packages/replay/src/Envelope.ts`
- Create: `packages/replay/src/Envelope.test.ts`

**Interfaces:**
- Consumes: `xorBytes`, Node `inflateSync` / `deflateSync`
- Produces: `Envelope` service `"@gimped/replay/Envelope"`
  - `open(bytes: Uint8Array): Effect<Uint8Array, InvalidReplay>` — try inflate; on success XOR; on inflate throw, return original bytes (no XOR)
  - `seal(bytes: Uint8Array): Effect<Uint8Array>` — XOR then deflate

- [ ] **Step 1: Write the failing test**

```ts
import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { deflateSync } from "node:zlib";
import { Envelope } from "./Envelope.ts";
import { EnvelopeLive } from "./layers.ts";
import { xorBytes } from "./xor.ts";
import { runWith } from "@gimped/common";

const run = runWith(EnvelopeLive);

describe("Envelope", () => {
  it("open reverses seal", async () => {
    const plain = Uint8Array.from([1, 2, 3, 4, 5]);
    const sealed = await run(Effect.gen(function* () {
      const env = yield* Envelope;
      return yield* env.seal(plain);
    }));
    const opened = await run(Effect.gen(function* () {
      const env = yield* Envelope;
      return yield* env.open(sealed);
    }));
    expect([...opened]).toEqual([...plain]);
  });

  it("open uses raw bytes when inflate fails", async () => {
    const raw = Uint8Array.from([9, 8, 7]);
    const opened = await run(Effect.gen(function* () {
      const env = yield* Envelope;
      return yield* env.open(raw);
    }));
    expect([...opened]).toEqual([9, 8, 7]);
  });

  it("open inflates then XORs", async () => {
    const plain = Uint8Array.from([1, 2, 3]);
    const sealed = deflateSync(xorBytes(plain));
    const opened = await run(Effect.gen(function* () {
      const env = yield* Envelope;
      return yield* env.open(sealed);
    }));
    expect([...opened]).toEqual([1, 2, 3]);
  });
});
```

Export `EnvelopeLive = Envelope.layer` from `layers.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gimped/replay exec vp test src/Envelope.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

```ts
import { Context, Effect, Layer } from "effect";
import { deflateSync, inflateSync } from "node:zlib";
import { InvalidReplay } from "./errors.ts";
import { xorBytes } from "./xor.ts";

export class Envelope extends Context.Service<
  Envelope,
  {
    readonly open: (bytes: Uint8Array) => Effect.Effect<Uint8Array, InvalidReplay>;
    readonly seal: (bytes: Uint8Array) => Effect.Effect<Uint8Array>;
  }
>()("@gimped/replay/Envelope") {
  static readonly layer = Layer.effect(
    Envelope,
    Effect.gen(function* () {
      const open = Effect.fn("Envelope.open")(function* (bytes: Uint8Array) {
        try {
          return xorBytes(inflateSync(bytes));
        } catch {
          return bytes;
        }
      });
      const seal = Effect.fn("Envelope.seal")(function* (bytes: Uint8Array) {
        return deflateSync(xorBytes(bytes));
      });
      return Envelope.of({ open, seal });
    }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gimped/replay exec vp test src/Envelope.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/replay/src/Envelope.ts packages/replay/src/Envelope.test.ts packages/replay/src/layers.ts
git commit -m "feat(replay): add zlib+XOR envelope with raw fallback"
```

---

### Task 10: GameData

**Files:**
- Create: `packages/replay/src/GameData.ts`
- Create: `packages/replay/src/GameData.test.ts`

**Interfaces:**
- Produces: `GameData` service `"@gimped/replay/GameData"`
  - `annotate(replay: Replay, dataPath?: string): Effect<Replay, GameDataError>`
- Layers:
  - `GameData.none` — always returns replay unchanged (ignores `dataPath`; for unit tests)
  - `GameData.layer` — if `dataPath` is omitted, return replay; if set, load that path (`FileSystem` + `Path`); missing path → `GameDataError`; `.swz` → `@gimped/swz` `decompile` + `resolveKey("latest")` then parse entry strings; directory → read files and parse XML contents
- Parse XML via `xmlToJson` from `@gimped/swz`. Tables:
  - `Hero` nodes: `@_HeroName` + child `HeroID` → `heroName`
  - `Costume` nodes: `CostumeName` + `CostumeID` → `costumeName`
  - Level nodes: `@_LevelName` / `DisplayName` + `LevelID` → `level.name` (prefer `DisplayName` text)
  - Scoring: `@_ScoringName` + `ScoringID` → `scoringTypeName`
  - Color: `@_ColorSchemeName` + `ColorSchemeID` → `colorSchemeName`
- Missing tables: omit names (not an error)
- `game.nameKey` is already in the bitstream when `nameId !== 0`; do not require GameData for it

Helper to read `#text` or raw string/number child values from the xmlToJson tree. Arrays vs single objects: normalize with `Array.isArray ? x : [x]`.

- [ ] **Step 1: Write the failing test**

`none`: annotate does not add `heroName`.

`GameData.layer` with a temp dir containing `HeroTypes.xml`:

```xml
<HeroTypes>
  <Hero HeroName="Bodvar"><HeroID>3</HeroID></Hero>
</HeroTypes>
```

Annotate a replay whose first heroId is 3 → `heroName` is `"Bodvar"`. Unknown id stays unnamed.

Missing path → `GameDataError`.

Use `NodeServices.layer` + `GameData.layer` and call `annotate(replay, dir)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gimped/replay exec vp test src/GameData.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

`annotate` copies the replay and fills optional keys when maps have the id.

`GameData.layer.annotate(replay, path)`: `fs.stat` / `readDirectory` / `readFileString`. `.swz` branch: `fs.readFile` → `resolveKey("latest")` → `decompile` → parse each `entry.content` if it looks like XML.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gimped/replay exec vp test src/GameData.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/replay/src/GameData.ts packages/replay/src/GameData.test.ts
git commit -m "feat(replay): add optional GameData name annotations"
```

---

### Task 11: Pipeline

**Files:**
- Create: `packages/replay/src/pipeline.ts`
- Create: `packages/replay/src/pipeline.test.ts`
- Modify: `packages/replay/src/layers.ts`
- Modify: `packages/replay/src/index.ts`

**Interfaces:**
- Produces: `Pipeline` service `"@gimped/replay/Pipeline"`
  - `decompileFile({ inPath, outPath, dataPath?: string }): Effect<void, IoError | InvalidReplay | ChecksumMismatch | GameDataError>`
  - `compileFile({ inPath, outPath }): Effect<void, IoError | MalformedJson | InvalidReplay>`
- Also export `decompileFile` / `compileFile` / `layer = Pipeline.Default` like SWZ
- Decompile: read bytes → `Envelope.open` → `ReplayCodec.decode` → optional `GameData.annotate` → `Schema.encodeUnknownEffect(ReplayJson)` → `JSON.stringify(value, null, 2) + "\n"` → write string
- Compile: read string → `Schema.decodeUnknownEffect(Schema.fromJsonString(ReplayJson))` mapped to `toMalformedJson` → `ReplayCodec.encode` → `Envelope.seal` → write bytes
- Encode Schema failure: `Effect.orDie` (defect)
- `Pipeline.Default` provides Envelope, ReplayCodec, and `GameData.layer` (loads `--data` when `dataPath` is set; no-op when omitted). Still requires `FileSystem` / `Path` (and SWZ services when `dataPath` is a `.swz`).

- [ ] **Step 1: Write the failing test**

Temp dir: compile `minimal()` JSON to `.replay`, decompile to another JSON, decode both with `ReplayJson`, `expect(second).toEqual(first)` (no names). Second case: compile with a `heroName` in JSON; decompile without `--data`; `heroName` absent. Third: invalid JSON compile → `MalformedJson`.

Use `TestLive = Pipeline.Default.pipe(Layer.provideMerge(NodeServices.layer))`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gimped/replay exec vp test src/pipeline.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement Pipeline** mirroring `packages/swz/src/pipeline.ts` (FileSystem read/write, `toIoError`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gimped/replay exec vp test src/pipeline.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/replay/src/pipeline.ts packages/replay/src/pipeline.test.ts packages/replay/src/layers.ts packages/replay/src/index.ts packages/replay/src/GameData.ts
git commit -m "feat(replay): add decompile/compile file pipeline"
```

---

### Task 12: `@gimped/replay-cli`

**Files:**
- Create: `packages/replay-cli/package.json`
- Create: `packages/replay-cli/tsconfig.json`
- Create: `packages/replay-cli/vite.config.ts`
- Create: `packages/replay-cli/src/bin.ts`
- Create: `packages/replay-cli/src/cli.ts`
- Create: `packages/replay-cli/src/commands/decompile.ts`
- Create: `packages/replay-cli/src/commands/compile.ts`
- Create: `packages/replay-cli/src/cli.test.ts`
- Modify: `tsconfig.json` (add replay-cli reference)

**Interfaces:**
- Consumes: `decompileFile`, `compileFile`, `layer` from `@gimped/replay`
- Produces: `Command.make("replay")` with subcommands `decompile` / `compile`
- Flags: `--in`, `--out`; decompile also `Flag.string("data").pipe(Flag.optional, Flag.withDescription("SWZ dir or .swz for ID names"))`
- Map `Option` data to `dataPath: option.pipe(Option.getOrUndefined)` (import `Option` from `effect`)

- [ ] **Step 1: Scaffold CLI package** like `packages/swz-cli` (`bin.replay` → `./src/bin.ts`, `start` script, deps `@gimped/replay`, `effect`, `@effect/platform-node`). `pnpm install`. Add tsconfig reference.

- [ ] **Step 2: Write the failing test**

Copy the structure of `packages/swz-cli/src/cli.test.ts`:

- subcommand names `["decompile", "compile"]`
- round-trip: write JSON `minimal()`, `compile --in --out`, `decompile --in --out`, parse JSON, equal to original without names

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @gimped/replay-cli exec vp test src/cli.test.ts`

Expected: FAIL

- [ ] **Step 4: Implement commands**

`bin.ts` identical to swz-cli except `import { layer } from "@gimped/replay"` and `Command.run(root, { version: "0.0.0" })`.

`decompile.ts`:

```ts
import { decompileFile } from "@gimped/replay";
import { Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

export const decompile = Command.make(
  "decompile",
  {
    in: Flag.string("in").pipe(Flag.withDescription("Input .replay file")),
    out: Flag.string("out").pipe(Flag.withDescription("Output JSON file")),
    data: Flag.string("data").pipe(
      Flag.optional,
      Flag.withDescription("SWZ directory or .swz for ID names"),
    ),
  },
  (config) =>
    decompileFile({
      inPath: config.in,
      outPath: config.out,
      dataPath: Option.getOrUndefined(config.data),
    }),
).pipe(Command.withDescription("Decompile a .replay file to JSON"));
```

`compile.ts`: `--in` JSON, `--out` `.replay`, no `--data`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @gimped/replay-cli exec vp test src/cli.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/replay-cli tsconfig.json pnpm-lock.yaml
git commit -m "feat(replay-cli): add decompile and compile commands"
```

---

### Task 13: Workspace verification

**Files:**
- Modify: only if exports/`index.ts` missed anything

**Interfaces:**
- Consumes: all prior packages

- [ ] **Step 1: Export check**

`packages/replay/src/index.ts` must export errors, xor, bitstream, checksum, ReplayJson, Envelope, ReplayCodec, GameData, pipeline, layers.

- [ ] **Step 2: Run full verification**

Run: `pnpm ready`

Expected: `vp check` + all package tests + builds succeed.

- [ ] **Step 3: Commit only if Step 1 required edits**

```bash
git add packages/replay/src/index.ts
git commit -m "chore(replay): export public API"
```

Skip the commit if nothing changed.

---

## Self-review (spec coverage)

| Spec requirement | Task |
| ---------------- | ---- |
| `@gimped/common` ByteReader/Writer + U16 | 1 |
| IoError, MalformedJson, toIoError, toMalformedJson, runWith | 2 |
| SWZ re-exports / tests still pass | 2 |
| Replay tagged errors | 3 |
| XOR key | 4 |
| Bitstream class_30 | 5 |
| Checksum method_3796 | 6 |
| ReplayJson Schema both ways | 7, 11 |
| Chunks 1–8, write order 3,4,6,1,5,7,2 | 8 |
| heroSlotCount > 5, checksum verify/recompute | 8 |
| zlib+XOR, raw fallback | 9 |
| `--data` names, IDs authoritative | 10, 11, 12 |
| Pipeline + CLI `--in/--out` | 11, 12 |
| `pnpm ready` | 13 |
| No `.replay` fixtures in repo | 8/11 synthetic only |
