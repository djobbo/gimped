import { describe, expect, it } from "vite-plus/test";
import { ChecksumMismatch, GameDataError, InvalidReplay } from "./errors.ts";

describe("replay errors", () => {
  it("constructs tagged errors", () => {
    const invalid = new InvalidReplay({ reason: "chunk 8" });
    const checksum = new ChecksumMismatch({ expected: 1, actual: 2 });
    const data = new GameDataError({ path: "/x", message: "missing" });
    expect(invalid._tag).toBe("InvalidReplay");
    expect(checksum._tag).toBe("ChecksumMismatch");
    expect(checksum.expected).toBe(1);
    expect(data._tag).toBe("GameDataError");
  });
});
