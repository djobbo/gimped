import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { UnknownVersion } from "./errors.ts";
import { VersionKeysLive } from "./layers.ts";
import { runWith } from "./test-utils.ts";
import { defaultVersionKeyMap, resolveKey } from "./VersionKeys.ts";

const run = runWith(VersionKeysLive);

describe("VersionKeys", () => {
  it("resolves latest alias to key 762411009", async () => {
    expect(await run(resolveKey("latest"))).toBe(762411009);
  });

  it("resolves build id directly", async () => {
    expect(await run(resolveKey("10090"))).toBe(762411009);
  });

  it("fails on unknown version", async () => {
    const result = await run(Effect.result(resolveKey("nope")));
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure).toBeInstanceOf(UnknownVersion);
      if (result.failure instanceof UnknownVersion) {
        expect(result.failure.version).toBe("nope");
      }
    }
  });

  it("ships default map with latest → 10090", () => {
    expect(defaultVersionKeyMap.aliases.latest).toBe("10090");
    expect(defaultVersionKeyMap.keys["10090"]).toBe(762411009);
  });
});
