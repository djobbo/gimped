import { runWith } from "@gimped/common";
import { deflateSync } from "node:zlib";
import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Envelope } from "./Envelope.ts";
import { InvalidAnm } from "./errors.ts";

const run = runWith(Envelope.layer);

describe("Envelope", () => {
  it("seals a payload with int32le size then zlib, and opens it back", async () => {
    const payload = Uint8Array.from([1, 2, 3, 4]);
    const sealed = await run(
      Effect.gen(function* () {
        const envelope = yield* Envelope;
        return yield* envelope.seal(payload);
      }),
    );
    expect(sealed[0]).toBe(4);
    expect(sealed[1]).toBe(0);
    expect(sealed[2]).toBe(0);
    expect(sealed[3]).toBe(0);
    const opened = await run(
      Effect.gen(function* () {
        const envelope = yield* Envelope;
        return yield* envelope.open(sealed);
      }),
    );
    expect([...opened]).toEqual([1, 2, 3, 4]);
  });

  it("opens when the size prefix is wrong as long as zlib is valid", async () => {
    const payload = Uint8Array.from([9]);
    const body = deflateSync(payload);
    const bytes = new Uint8Array(4 + body.length);
    bytes[0] = 99;
    bytes.set(body, 4);
    const opened = await run(
      Effect.gen(function* () {
        const envelope = yield* Envelope;
        return yield* envelope.open(bytes);
      }),
    );
    expect([...opened]).toEqual([9]);
  });

  it("fails InvalidAnm when zlib is garbage", async () => {
    const error = await run(
      Effect.gen(function* () {
        const envelope = yield* Envelope;
        return yield* envelope.open(Uint8Array.from([1, 0, 0, 0, 1, 2, 3])).pipe(Effect.flip);
      }),
    );
    expect(error).toBeInstanceOf(InvalidAnm);
    expect(error.reason).toBe("bad zlib");
  });
});
