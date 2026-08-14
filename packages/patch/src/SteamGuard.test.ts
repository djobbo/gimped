import { expect, layer } from "@effect/vitest";
import { Effect, Layer, Stdio, Stream } from "effect";
import { SteamGuard } from "./SteamGuard.ts";

layer(SteamGuard.succeed("12345"))("SteamGuard.succeed", (it) => {
  it.effect("returns the provided code", () =>
    Effect.gen(function* () {
      const guard = yield* SteamGuard;
      const code = yield* guard.requestCode;
      expect(code).toBe("12345");
    }),
  );
});

const stdinLive = (text: string) =>
  SteamGuard.layerStdin.pipe(
    Layer.provide(Stdio.layerTest({ stdin: Stream.make(new TextEncoder().encode(text)) })),
  );

layer(stdinLive("abc123\n"))("SteamGuard.layerStdin", (it) => {
  it.effect("reads one line from Stdio stdin", () =>
    Effect.gen(function* () {
      const guard = yield* SteamGuard;
      const code = yield* guard.requestCode;
      expect(code).toBe("abc123");
    }),
  );
});
