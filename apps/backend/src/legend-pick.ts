import { BitReader } from "./bitstream.ts";

/** LinkUpdater.method_6666 hero-slot row (class_184). */
export type LegendHeroSlot = {
  readonly enabled: boolean;
  readonly heroId: number;
  readonly costumeId: number;
  readonly field3172: number;
  readonly field15218: number;
};

/** Client legend / loadout pick (LinkUpdater.var_5607 / method_6666). */
export type LegendPick = {
  readonly isBot: boolean;
  /** Lobby slot index (`class_107.var_4118`), not account user id. */
  readonly slotId: number;
  /** Selected hero (`class_107.var_7752`). */
  readonly heroId: number;
  readonly ready: boolean;
  readonly colorA: number;
  readonly colorB: number;
  readonly colorC: number;
  readonly slotCount: number;
  readonly slots: ReadonlyArray<LegendHeroSlot>;
};

export type HeroSlotLoadout = {
  readonly heroId: number;
  readonly costumeId: number;
};

export const decodeLegendPick = (payload: Uint8Array): LegendPick => {
  const bits = new BitReader(payload);
  const isBot = bits.readBool();
  const slotId = bits.readPackedU32();
  const heroId = bits.readPackedU32();
  const ready = bits.readBool();
  const colorA = bits.readPackedU32();
  const colorB = bits.readPackedU32();
  const colorC = bits.readPackedU32();
  const slotCount = bits.readPackedU32();
  const slots: LegendHeroSlot[] = [];
  for (let i = 0; i < slotCount; i++) {
    const enabled = bits.readBool();
    bits.readBool();
    const heroSlotId = bits.readPackedU32();
    const costumeId = bits.readPackedU32();
    const field3172 = bits.readPackedU32();
    const field15218 = bits.readPackedU32();
    slots.push({ enabled, heroId: heroSlotId, costumeId, field3172, field15218 });
  }
  return {
    isBot,
    slotId,
    heroId,
    ready,
    colorA,
    colorB,
    colorC,
    slotCount,
    slots,
  };
};

/** Primary skin for the currently selected hero (`var_14783` on the active slot). */
export const primaryCostumeFromPick = (pick: LegendPick): number => {
  const active =
    pick.slots.find((slot) => slot.enabled && slot.heroId === pick.heroId) ??
    pick.slots.find((slot) => slot.enabled) ??
    pick.slots.find((slot) => slot.heroId === pick.heroId) ??
    pick.slots[0];
  return active?.costumeId ?? 0;
};

/** Per-slot hero + costume rows for 10310 (`var_12764` / method_215). */
export const heroSlotsFromPick = (
  pick: LegendPick,
  fallbackHeroId: number,
  fallbackCostumeId: number,
): ReadonlyArray<HeroSlotLoadout> => {
  if (pick.slots.length === 0) {
    return [{ heroId: pick.heroId, costumeId: primaryCostumeFromPick(pick) || fallbackCostumeId }];
  }
  return pick.slots.map((slot) => ({
    heroId: slot.heroId > 0 ? slot.heroId : pick.heroId || fallbackHeroId,
    costumeId: slot.costumeId > 0 ? slot.costumeId : fallbackCostumeId,
  }));
};

export const padHeroSlots = (
  slots: ReadonlyArray<HeroSlotLoadout>,
  count: number,
  fallback: HeroSlotLoadout,
): ReadonlyArray<HeroSlotLoadout> => {
  const padded = [...slots];
  while (padded.length < count) {
    padded.push(padded[padded.length - 1] ?? fallback);
  }
  return padded.slice(0, count);
};
