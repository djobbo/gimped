import { describe, expect, it } from "@effect/vitest";
import { BitWriter } from "./bitstream.ts";
import { decodeIntroEntitySync } from "./game-intro-sync.ts";

describe("game intro sync", () => {
  it("decodes 10419 intro entity sync with client sim tick", () => {
    const writer = new BitWriter();
    writer.writeBool(true);
    writer.writePackedU32(4800);
    expect(decodeIntroEntitySync(writer.toUint8Array())).toEqual({
      active: true,
      clientSimTick: 4800,
    });
  });

  it("returns undefined for empty payloads", () => {
    expect(decodeIntroEntitySync(new Uint8Array())).toBeUndefined();
  });
});
