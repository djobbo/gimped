import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import { deflateSync } from "node:zlib";
import { Envelope } from "./Envelope.ts";
import { InvalidAnm } from "./errors.ts";

layer(Envelope.layer)("Envelope", (it) => {
  it.effect("seals a payload with int32le size then zlib, and opens it back", () =>
    Effect.gen(function* () {
      const payload = Uint8Array.from([1, 2, 3, 4]);
      const envelope = yield* Envelope;
      const sealed = yield* envelope.seal(payload);
      expect(sealed[0]).toBe(4);
      expect(sealed[1]).toBe(0);
      expect(sealed[2]).toBe(0);
      expect(sealed[3]).toBe(0);
      const opened = yield* envelope.open(sealed);
      expect([...opened]).toEqual([1, 2, 3, 4]);
    }),
  );

  it.effect("opens when the size prefix is wrong as long as zlib is valid", () =>
    Effect.gen(function* () {
      const payload = Uint8Array.from([9]);
      const body = deflateSync(payload);
      const bytes = new Uint8Array(4 + body.length);
      bytes[0] = 99;
      bytes.set(body, 4);
      const envelope = yield* Envelope;
      const opened = yield* envelope.open(bytes);
      expect([...opened]).toEqual([9]);
    }),
  );

  it.effect("fails InvalidAnm when zlib is garbage", () =>
    Effect.gen(function* () {
      const envelope = yield* Envelope;
      const error = yield* envelope.open(Uint8Array.from([1, 0, 0, 0, 1, 2, 3])).pipe(Effect.flip);
      expect(error).toBeInstanceOf(InvalidAnm);
      expect(error.reason).toBe("bad zlib");
    }),
  );
});
