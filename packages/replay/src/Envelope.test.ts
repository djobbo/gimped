import { runWith } from "@gimped/common";
import { Effect } from "effect";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vite-plus/test";
import { Envelope } from "./Envelope.ts";
import { EnvelopeLive } from "./layers.ts";
import { xorBytes, Xor } from "./xor.ts";

const run = runWith(EnvelopeLive);
const runXor = runWith(Xor.layer);

describe("Envelope", () => {
  it("open reverses seal", async () => {
    const plain = Uint8Array.from([1, 2, 3, 4, 5]);
    const sealed = await run(
      Effect.gen(function* () {
        const env = yield* Envelope;
        return yield* env.seal(plain);
      }),
    );
    const opened = await run(
      Effect.gen(function* () {
        const env = yield* Envelope;
        return yield* env.open(sealed);
      }),
    );
    expect([...opened]).toEqual([...plain]);
  });

  it("open uses raw bytes when inflate fails", async () => {
    const raw = Uint8Array.from([9, 8, 7]);
    const opened = await run(
      Effect.gen(function* () {
        const env = yield* Envelope;
        return yield* env.open(raw);
      }),
    );
    expect([...opened]).toEqual([9, 8, 7]);
  });

  it("open inflates then XORs", async () => {
    const plain = Uint8Array.from([1, 2, 3]);
    const xored = await runXor(xorBytes(plain));
    const sealed = deflateSync(xored);
    const opened = await run(
      Effect.gen(function* () {
        const env = yield* Envelope;
        return yield* env.open(sealed);
      }),
    );
    expect([...opened]).toEqual([1, 2, 3]);
  });
});
