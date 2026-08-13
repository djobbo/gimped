import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import { UnknownVersion } from "./errors.ts";
import { VersionKeysLive } from "./layers.ts";
import { defaultVersionKeyMap, resolveKey } from "./VersionKeys.ts";

layer(VersionKeysLive)("VersionKeys", (it) => {
  it.effect("resolves latest alias to key 762411009", () =>
    Effect.gen(function* () {
      expect(yield* resolveKey("latest")).toBe(762411009);
    }),
  );

  it.effect("resolves build id directly", () =>
    Effect.gen(function* () {
      expect(yield* resolveKey("10090")).toBe(762411009);
    }),
  );

  it.effect("fails on unknown version", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(resolveKey("nope"));
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(UnknownVersion);
        if (result.failure instanceof UnknownVersion) {
          expect(result.failure.version).toBe("nope");
        }
      }
    }),
  );

  it("ships default map with latest → 10090", () => {
    expect(defaultVersionKeyMap.aliases.latest).toBe("10090");
    expect(defaultVersionKeyMap.keys["10090"]).toBe(762411009);
  });
});
