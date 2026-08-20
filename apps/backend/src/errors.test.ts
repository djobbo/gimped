import { describe, expect, it } from "@effect/vitest";
import { MatchSpecParseError, UdpBindError } from "./errors.ts";

describe("backend errors", () => {
  it("constructs UdpBindError", () => {
    const err = new UdpBindError({ host: "127.0.0.1", message: "boom" });
    expect(err._tag).toBe("UdpBindError");
    expect(err.host).toBe("127.0.0.1");
    expect(err.message).toBe("boom");
  });

  it("constructs MatchSpecParseError", () => {
    const err = new MatchSpecParseError({ reason: "bad json" });
    expect(err._tag).toBe("MatchSpecParseError");
    expect(err.reason).toBe("bad json");
  });
});
