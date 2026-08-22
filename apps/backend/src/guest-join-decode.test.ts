import { describe, expect, it } from "@effect/vitest";
import { BitReader } from "./bitstream.ts";
import { encodeLocalGuestJoin } from "./custom-lobby.ts";
import { applyLocalGuestJoin, initialLobbyState } from "./lobby-state.ts";

describe("encodeLocalGuestJoin decode", () => {
  it("matches writeHost-style human body plus trailing bool", () => {
    const guest = applyLocalGuestJoin(initialLobbyState(), 1).guests[0]!;
    const payload = encodeLocalGuestJoin(guest);
    const bits = new BitReader(payload);
    expect(bits.readBool()).toBe(false);
    expect(bits.readPackedU32()).toBe(1);
    expect(bits.readString()).toBe("Gimped");
    bits.readString();
    bits.readPackedU32();
    bits.readPackedU32();
    bits.readPackedU32();
    bits.readString();
    expect(bits.readPackedU32()).toBe(1);
    expect(bits.readPackedU32()).toBe(1);
    expect(bits.readPackedU32()).toBe(guest.heroId);
    expect(bits.readPackedU32()).toBe(guest.costumeId);
    for (let i = 0; i < 4; i++) bits.readPackedU32();
    bits.readPackedU24();
    bits.readPackedU32();
    bits.readPackedU24();
    bits.readBool();
    expect(bits.readPackedU32()).toBe(0);
    expect(bits.readBool()).toBe(false);
  });
});
