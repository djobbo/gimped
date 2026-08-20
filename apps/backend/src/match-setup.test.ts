import { describe, expect, it } from "@effect/vitest";
import { BitReader } from "./bitstream.ts";
import { STUB_USER_ID } from "./login-accepted.ts";
import {
  decodeMatchSetup,
  encodeMatchSetupLegacy,
  STUB_COSTUME_ID,
  STUB_HERO_ID,
  STUB_HERO_SLOTS,
} from "./match-setup.ts";

const consumeMatchSetup = (payload: Uint8Array, heroSlots: number): void => {
  const bits = new BitReader(payload);
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU24();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  expect(bits.readPackedU32()).toBe(heroSlots);
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readBool();
  for (let i = 0; i < 15; i++) bits.readPackedU32();
  while (bits.readBool()) {
    bits.readPackedU32();
    bits.readString();
    bits.readString();
    bits.readPackedU32();
    bits.readPackedU32();
    bits.readPackedU32();
    bits.readPackedU32();
    bits.readPackedU32();
    bits.readBool();
    bits.readBool();
    bits.readBool();
    bits.readPackedU32();
    for (let i = 0; i < 6; i++) bits.readPackedU32();
    for (let i = 0; i < 8; i++) bits.readPackedU32();
    bits.readPackedU24();
    bits.readPackedU24();
    while (bits.readBool()) {
      bits.readPackedU32();
      bits.readPackedU32();
    }
    bits.readPackedU24();
    bits.readPackedU32();
    bits.readPackedU24();
    bits.readPackedU24();
    bits.readPackedU32();
    bits.readPackedU32();
    bits.readString();
    for (let i = 0; i < heroSlots; i++) {
      expect(bits.readPackedU32()).toBe(STUB_HERO_ID);
      expect(bits.readPackedU32()).toBe(STUB_COSTUME_ID);
      bits.readBool();
      bits.readPackedU32();
      bits.readPackedU32();
      bits.readPackedU32();
    }
  }
  expect(bits.remainingBits).toBeLessThan(8);
};

describe("match setup 10310", () => {
  it("round-trips a host-only custom snapshot (method_215)", () => {
    const decoded = decodeMatchSetup(encodeMatchSetupLegacy({ includeBot: false }));
    expect(decoded).toEqual({
      _tag: "MatchSetup",
      custom: true,
      playerCount: 1,
      hostUserId: STUB_USER_ID,
    });
  });

  it("includes a second player when includeBot is true", () => {
    expect(decodeMatchSetup(encodeMatchSetupLegacy({ includeBot: true })).playerCount).toBe(2);
  });

  it("leaves no trailing bits after decode (method_215 alignment)", () => {
    consumeMatchSetup(encodeMatchSetupLegacy({ includeBot: false }), STUB_HERO_SLOTS);
    consumeMatchSetup(encodeMatchSetupLegacy({ includeBot: true }), STUB_HERO_SLOTS);
  });

  it("assigns opposing teams to host and bot (var_3536)", () => {
    const bits = new BitReader(encodeMatchSetupLegacy({ includeBot: true }));
    bits.readPackedU32();
    bits.readPackedU32();
    bits.readPackedU24();
    bits.readPackedU32();
    bits.readPackedU32();
    bits.readPackedU32();
    const heroSlots = bits.readPackedU32();
    bits.readPackedU32();
    bits.readPackedU32();
    bits.readPackedU32();
    bits.readBool();
    for (let i = 0; i < 15; i++) bits.readPackedU32();
    const teams: number[] = [];
    while (bits.readBool()) {
      bits.readPackedU32();
      bits.readString();
      bits.readString();
      bits.readPackedU32();
      bits.readPackedU32();
      bits.readPackedU32();
      bits.readPackedU32();
      bits.readPackedU32();
      bits.readBool();
      bits.readBool();
      bits.readBool();
      bits.readPackedU32();
      for (let i = 0; i < 6; i++) bits.readPackedU32();
      for (let i = 0; i < 8; i++) bits.readPackedU32();
      bits.readPackedU24();
      bits.readPackedU24();
      while (bits.readBool()) {
        bits.readPackedU32();
        bits.readPackedU32();
      }
      bits.readPackedU24();
      bits.readPackedU32();
      bits.readPackedU24();
      teams.push(bits.readPackedU24());
      bits.readPackedU32();
      bits.readPackedU32();
      bits.readString();
      for (let i = 0; i < heroSlots; i++) {
        bits.readPackedU32();
        bits.readPackedU32();
        bits.readBool();
        bits.readPackedU32();
        bits.readPackedU32();
        bits.readPackedU32();
      }
    }
    expect(teams).toEqual([1, 2]);
  });
});
