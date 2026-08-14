import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";
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
