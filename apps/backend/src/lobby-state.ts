import {
  decodeLegendPick,
  heroSlotsFromPick,
  padHeroSlots,
  primaryCostumeFromPick,
  type HeroSlotLoadout,
  type LegendPick,
} from "./legend-pick.ts";

/** Timed custom rooms read two hero rows per player in 10310 (method_215). */
export const HERO_SLOTS_PER_PLAYER = 2;

export const STUB_MAX_PLAYERS = 4;
export const STUB_REGION_ID = 2;
export const BOT_CONTROLLER = 5;

/** HeroType.var_1268 index (HeroID in HeroTypes.xml). Bodvar is 3. */
export const DEFAULT_HOST_HERO_ID = 3;
/** Viking default skin (CostumeID in costumeTypes.csv). */
export const DEFAULT_HOST_COSTUME_ID = 3;

/** Fifteen packed u32 ruleset fields when playlist id is 0 (class_104.method_1562). */
export type RulesetFields = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export const DEFAULT_RULESET: RulesetFields = [
  0,
  STUB_MAX_PLAYERS,
  180,
  0,
  0,
  1,
  0,
  100,
  100,
  1,
  2,
  2,
  4,
  0,
  0,
];

export type { HeroSlotLoadout };

export const defaultHostHeroSlots = (): ReadonlyArray<HeroSlotLoadout> =>
  Array.from({ length: HERO_SLOTS_PER_PLAYER }, () => ({
    heroId: DEFAULT_HOST_HERO_ID,
    costumeId: DEFAULT_HOST_COSTUME_ID,
  }));

export type LobbyBot = {
  readonly controller: number;
  readonly entityId: number;
  readonly heroId: number;
  readonly costumeId: number;
};

/** Second keyboard / local split-input seat (same account, var_12478==2). */
export type LobbyGuest = {
  readonly controller: number;
  readonly localIndex: number;
  readonly entityId: number;
  readonly heroId: number;
  readonly costumeId: number;
  readonly heroSlots: ReadonlyArray<HeroSlotLoadout>;
};

export type LobbyState = {
  readonly playlistId: number;
  readonly customGameType: number;
  readonly maxPlayers: number;
  readonly ruleset: RulesetFields;
  readonly levelPick: number;
  readonly regionId: number;
  readonly hostHeroId: number;
  readonly hostCostumeId: number;
  readonly hostHeroSlots: ReadonlyArray<HeroSlotLoadout>;
  readonly guests: ReadonlyArray<LobbyGuest>;
  readonly bots: ReadonlyArray<LobbyBot>;
  readonly nextEntityId: number;
};

export const initialLobbyState = (): LobbyState => ({
  playlistId: 0,
  customGameType: 1,
  maxPlayers: STUB_MAX_PLAYERS,
  ruleset: DEFAULT_RULESET,
  levelPick: 0,
  regionId: STUB_REGION_ID,
  hostHeroId: DEFAULT_HOST_HERO_ID,
  hostCostumeId: DEFAULT_HOST_COSTUME_ID,
  hostHeroSlots: defaultHostHeroSlots(),
  guests: [],
  bots: [],
  nextEntityId: 2,
});

const occupiedSeats = (state: LobbyState): number => 1 + state.guests.length + state.bots.length;

export const nextGuestController = (state: LobbyState): number => {
  const used = new Set<number>([0, ...state.guests.map((guest) => guest.controller)]);
  let controller = 1;
  while (used.has(controller) || controller === BOT_CONTROLLER) controller += 1;
  return controller;
};

export type ParsedUpdateSettings = {
  readonly playlistId: number;
  readonly customGameType: number;
  readonly maxPlayers: number;
  readonly ruleset: RulesetFields;
  readonly levelPick: number;
  readonly regionId: number;
  readonly flagsA: boolean;
  readonly flagsB: boolean;
};

export const rulesetFromArray = (fields: ReadonlyArray<number>): RulesetFields => {
  if (fields.length !== 15) return DEFAULT_RULESET;
  // SAFETY: length check above guarantees the tuple width for RulesetFields.
  return [...fields] as RulesetFields;
};

export const applyUpdateSettings = (
  state: LobbyState,
  parsed: ParsedUpdateSettings,
): LobbyState => ({
  ...state,
  playlistId: parsed.playlistId,
  customGameType: parsed.customGameType,
  maxPlayers: parsed.maxPlayers,
  ruleset: parsed.ruleset,
  levelPick: parsed.levelPick,
  regionId: parsed.regionId,
});

export const applyLegendPickToState = (state: LobbyState, pick: LegendPick): LobbyState => {
  if (pick.heroId === 0) return state;

  if (pick.isBot) {
    const botIndex = pick.slotId;
    if (botIndex < 0 || botIndex >= state.bots.length) return state;
    const costumeId = primaryCostumeFromPick(pick) || state.bots[botIndex]!.costumeId;
    const bots = state.bots.map((bot, index) =>
      index === botIndex ? { ...bot, heroId: pick.heroId, costumeId } : bot,
    );
    return { ...state, bots };
  }

  // Human legend picks send var_4118 (controller), not lobby array index.
  const guestIndex = state.guests.findIndex((guest) => guest.controller === pick.slotId);
  if (guestIndex >= 0) {
    const guest = state.guests[guestIndex]!;
    const fallback = { heroId: guest.heroId, costumeId: guest.costumeId };
    const heroSlots = padHeroSlots(
      heroSlotsFromPick(pick, guest.heroId, guest.costumeId),
      HERO_SLOTS_PER_PLAYER,
      fallback,
    );
    const costumeId = primaryCostumeFromPick(pick) || heroSlots[0]?.costumeId || guest.costumeId;
    const guests = state.guests.map((entry, index) =>
      index === guestIndex ? { ...entry, heroId: pick.heroId, costumeId, heroSlots } : entry,
    );
    return { ...state, guests };
  }

  const fallback = {
    heroId: state.hostHeroId,
    costumeId: state.hostCostumeId,
  };
  const hostHeroSlots = padHeroSlots(
    heroSlotsFromPick(pick, state.hostHeroId, state.hostCostumeId),
    HERO_SLOTS_PER_PLAYER,
    fallback,
  );
  const hostCostumeId =
    primaryCostumeFromPick(pick) || hostHeroSlots[0]?.costumeId || state.hostCostumeId;

  return {
    ...state,
    hostHeroId: pick.heroId,
    hostCostumeId,
    hostHeroSlots,
  };
};

export type AddBotRequest = {
  readonly add: boolean;
  readonly controller: number;
};

export const applyAddBotRequest = (state: LobbyState, request: AddBotRequest): LobbyState => {
  if (!request.add) return state;
  if (occupiedSeats(state) >= state.maxPlayers) return state;
  const entityId = state.nextEntityId;
  return {
    ...state,
    nextEntityId: entityId + 1,
    bots: [
      ...state.bots,
      {
        controller: request.controller,
        entityId,
        heroId: DEFAULT_HOST_HERO_ID,
        costumeId: DEFAULT_HOST_COSTUME_ID,
      },
    ],
  };
};

/** Packet 44 bool-false or packet 80 — local keyboard / controller seat join. */
export const applyLocalGuestJoin = (state: LobbyState, controller: number): LobbyState => {
  if (controller === 0) return state;
  if (state.guests.some((guest) => guest.controller === controller)) return state;
  if (occupiedSeats(state) >= state.maxPlayers) return state;
  const entityId = state.nextEntityId;
  const localIndex = state.guests.length + 1;
  return {
    ...state,
    nextEntityId: entityId + 1,
    guests: [
      ...state.guests,
      {
        controller,
        localIndex,
        entityId,
        heroId: DEFAULT_HOST_HERO_ID,
        costumeId: DEFAULT_HOST_COSTUME_ID,
        heroSlots: defaultHostHeroSlots(),
      },
    ],
  };
};

export const lobbyStateFromLegendPayload = (state: LobbyState, payload: Uint8Array): LobbyState =>
  applyLegendPickToState(state, decodeLegendPick(payload));
