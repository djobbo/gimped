import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { PatchIndexText, PatchRegistryText } from "./schemas.ts";

describe("patch schemas", () => {
  it("round-trips registry.json", () => {
    const raw = {
      steamAppId: 291550,
      steamDepotId: 291551,
      steamManifestId: "123",
      fullDepot: false,
      clientBuild: "10090",
      swzKey: 762411009,
      swf: "BrawlhallaAir.swf",
      files: ["BrawlhallaAir.swf", "Game.swz"],
    };
    const decoded = Schema.decodeUnknownSync(PatchRegistryText)(JSON.stringify(raw));
    expect(decoded.swzKey).toBe(762411009);
    const encoded = Schema.encodeUnknownSync(PatchRegistryText)(decoded);
    expect(JSON.parse(encoded).clientBuild).toBe("10090");
  });

  it("allows index.json without latestManifestId", () => {
    const decoded = Schema.decodeUnknownSync(PatchIndexText)(
      JSON.stringify({
        patches: {
          "123": { clientBuild: "10090", swzKey: 762411009, fetchedAt: "2026-08-14T10:00:00.000Z" },
        },
      }),
    );
    expect(decoded.latestManifestId).toBeUndefined();
    expect(decoded.patches["123"]?.clientBuild).toBe("10090");
  });
});
