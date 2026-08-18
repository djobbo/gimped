import { describe, expect, it } from "@effect/vitest";
import { decodeGameConnect, encodeGameConnect } from "./game-connect.ts";
import { toHex } from "./framing.ts";

describe("game connect 10405", () => {
  it("round-trips packed user id + token (method_5889)", () => {
    expect(decodeGameConnect(encodeGameConnect({ userId: 1, token: "gimped" }))).toEqual({
      _tag: "GameConnect",
      userId: 1,
      token: "gimped",
    });
  });

  it("decodes the captured payload from method_5889", () => {
    const payload = Uint8Array.from(Buffer.from("0400199da5b5c19590", "hex"));
    expect(decodeGameConnect(payload)).toEqual({
      _tag: "GameConnect",
      userId: 1,
      token: "gimped",
    });
    expect(toHex(encodeGameConnect({ userId: 1, token: "gimped" }))).toBe("0400199da5b5c19590");
  });
});
