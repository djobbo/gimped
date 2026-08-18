import { describe, expect, it } from "@effect/vitest";
import { STUB_USER_ID } from "./login-accepted.ts";
import { decodeMatchSetup, encodeMatchSetup } from "./match-setup.ts";

describe("match setup 10310", () => {
  it("round-trips a host-only custom snapshot (method_215)", () => {
    const decoded = decodeMatchSetup(encodeMatchSetup({ includeBot: false }));
    expect(decoded).toEqual({
      _tag: "MatchSetup",
      custom: true,
      playerCount: 1,
      hostUserId: STUB_USER_ID,
    });
  });

  it("includes a second player when includeBot is true", () => {
    expect(decodeMatchSetup(encodeMatchSetup({ includeBot: true })).playerCount).toBe(2);
  });
});
