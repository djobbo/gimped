import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { UnknownVersion } from "./errors.ts";
import { defaultVersionKeyMap, resolveKey } from "./VersionKeys.ts";

describe("VersionKeys", () => {
  it("resolves latest alias to key 762411009", async () => {
    const key = await Effect.runPromise(resolveKey("latest"));
    expect(key).toBe(762411009);
  });

  it("resolves build id directly", async () => {
    const key = await Effect.runPromise(resolveKey("10090"));
    expect(key).toBe(762411009);
  });

  it("fails on unknown version", async () => {
    const result = await Effect.runPromise(Effect.result(resolveKey("nope")));
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure).toBeInstanceOf(UnknownVersion);
      expect(result.failure.version).toBe("nope");
    }
  });

  it("ships default map with latest → 10090", () => {
    expect(defaultVersionKeyMap.aliases.latest).toBe("10090");
    expect(defaultVersionKeyMap.keys["10090"]).toBe(762411009);
  });
});
