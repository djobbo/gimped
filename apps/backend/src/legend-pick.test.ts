import { describe, expect, it } from "@effect/vitest";
import { BitWriter } from "./bitstream.ts";
import { applyLegendPickToState, initialLobbyState } from "./lobby-state.ts";
import { decodeLegendPick, heroSlotsFromPick, primaryCostumeFromPick } from "./legend-pick.ts";
import { encodeMatchSetup, matchSetupOptionsFromSpec } from "./match-setup.ts";
import { MatchSetupSpec } from "./match-spec.ts";
import { BitReader } from "./bitstream.ts";

const encodeLegendPick = (options: {
  readonly slotId: number;
  readonly heroId: number;
  readonly costumeId: number;
  readonly slotCount?: number;
}): Uint8Array => {
  const bits = new BitWriter();
  bits.writeBool(false);
  bits.writePackedU32(options.slotId);
  bits.writePackedU32(options.heroId);
  bits.writeBool(false);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  const slotCount = options.slotCount ?? 2;
  bits.writePackedU32(slotCount);
  for (let i = 0; i < slotCount; i++) {
    bits.writeBool(true);
    bits.writeBool(true);
    bits.writePackedU32(options.heroId);
    bits.writePackedU32(options.costumeId);
    bits.writePackedU32(0);
    bits.writePackedU32(0);
  }
  return bits.toUint8Array();
};

describe("legend pick loadout", () => {
  it("accepts lobby slot 0 (not account user id) for host picks", () => {
    const pick = decodeLegendPick(encodeLegendPick({ slotId: 0, heroId: 58, costumeId: 120 }));
    const next = applyLegendPickToState(initialLobbyState(), pick);
    expect(next.hostHeroId).toBe(58);
    expect(next.hostCostumeId).toBe(120);
    expect(next.hostHeroSlots[0]).toEqual({ heroId: 58, costumeId: 120 });
  });

  it("flows picked hero and skin into 10310", () => {
    const pick = decodeLegendPick(encodeLegendPick({ slotId: 0, heroId: 58, costumeId: 120 }));
    const lobby = applyLegendPickToState(initialLobbyState(), pick);
    const payload = encodeMatchSetup(
      matchSetupOptionsFromSpec(
        new MatchSetupSpec({
          hostHeroId: lobby.hostHeroId,
          hostCostumeId: lobby.hostCostumeId,
          hostHeroSlots: [...lobby.hostHeroSlots],
          ruleset: [...lobby.ruleset],
          bots: [],
        }),
      ),
    );
    const bits = new BitReader(payload);
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
    expect(bits.readBool()).toBe(true);
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
    expect(bits.readPackedU32()).toBe(58);
    expect(bits.readPackedU32()).toBe(120);
    expect(heroSlots).toBe(2);
    expect(primaryCostumeFromPick(pick)).toBe(120);
    expect(heroSlotsFromPick(pick, 3, 3)[0]?.costumeId).toBe(120);
  });
});
