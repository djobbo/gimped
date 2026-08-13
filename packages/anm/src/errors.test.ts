import { describe, expect, it } from "@effect/vitest";
import { GameDataError, InvalidAnm, MissingIndex } from "./errors.ts";

describe("anm errors", () => {
  it("tags InvalidAnm, MissingIndex, and GameDataError", () => {
    expect(new InvalidAnm({ reason: "truncated" })._tag).toBe("InvalidAnm");
    expect(new MissingIndex({ path: "/tmp/index.json" })._tag).toBe("MissingIndex");
    expect(new GameDataError({ path: "x", message: "nope" })._tag).toBe("GameDataError");
  });
});
