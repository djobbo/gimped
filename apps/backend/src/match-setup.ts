import { BitReader, BitWriter } from "./bitstream.ts";
import { BOT_CONTROLLER, writeRuleset } from "./custom-lobby.ts";
import { DEFAULT_RULESET, rulesetFromArray } from "./lobby-state.ts";
import { STUB_UDP_CHANNEL } from "./game-udp-datagram.ts";
import { STUB_DISPLAY_NAME, STUB_USER_ID } from "./login-accepted.ts";
import type { MatchSetupSpec } from "./match-spec.ts";

/** HeroType.var_1268 index (HeroID in HeroTypes.xml). 0 is invalid; Bodvar is 3. */
export const STUB_HERO_ID = 3;
/** Viking default skin (CostumeID in costumeTypes.csv). CostumeType[0] is the template row. */
export const STUB_COSTUME_ID = 3;
/** class_139.method_215 header field _loc7_ — hero records read per player. Must be >= ScoringType.TIMED EntitiesPerPlayer (2). */
export const STUB_HERO_SLOTS = 2;

export type MatchSetup = {
  readonly _tag: "MatchSetup";
  readonly custom: boolean;
  readonly playerCount: number;
  readonly hostUserId: number;
};

export type MatchSetupEncodeOptions = {
  readonly hostHeroId: number;
  readonly hostCostumeId: number;
  readonly hostHeroSlots: ReadonlyArray<{ readonly heroId: number; readonly costumeId: number }>;
  readonly ruleset: ReadonlyArray<number>;
  readonly guests: ReadonlyArray<{
    readonly controller: number;
    readonly entityId: number;
    readonly heroId: number;
    readonly costumeId: number;
    readonly heroSlots: ReadonlyArray<{ readonly heroId: number; readonly costumeId: number }>;
  }>;
  readonly bots: ReadonlyArray<{
    readonly controller: number;
    readonly entityId: number;
    readonly heroId: number;
    readonly costumeId: number;
  }>;
};

const writeEmptyPackedPairs = (bits: BitWriter): void => {
  bits.writeBool(false);
};

const writeHeroSlots = (
  bits: BitWriter,
  slots: ReadonlyArray<{ readonly heroId: number; readonly costumeId: number }>,
  fallback: { readonly heroId: number; readonly costumeId: number },
): void => {
  for (let i = 0; i < STUB_HERO_SLOTS; i++) {
    const slot = slots[i] ?? fallback;
    bits.writePackedU32(slot.heroId);
    bits.writePackedU32(slot.costumeId);
    bits.writeBool(false);
    bits.writePackedU32(0);
    bits.writePackedU32(0);
    bits.writePackedU32(0);
  }
};

const writePlayer = (
  bits: BitWriter,
  player: {
    readonly name: string;
    readonly entityId: number;
    readonly userId: number;
    readonly local: boolean;
    readonly isBotRecord: boolean;
    readonly botCostume: boolean;
    readonly controller: number;
    /** class_287.var_3536 — must differ for hostile hit detection (method_5287). */
    readonly team: number;
    readonly heroId: number;
    readonly costumeId: number;
  },
  heroSlots: ReadonlyArray<{ readonly heroId: number; readonly costumeId: number }>,
  fallback: { readonly heroId: number; readonly costumeId: number },
): void => {
  bits.writeBool(true);
  bits.writePackedU32(0);
  bits.writeString(player.name);
  bits.writeString("");
  bits.writePackedU32(0);
  bits.writePackedU32(player.entityId);
  bits.writePackedU32(player.userId);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writeBool(player.local);
  bits.writeBool(player.isBotRecord);
  bits.writeBool(player.botCostume);
  bits.writePackedU32(player.controller);
  for (let i = 0; i < 6; i++) bits.writePackedU32(0);
  for (let i = 0; i < 8; i++) bits.writePackedU32(0);
  bits.writePackedU24(0);
  bits.writePackedU24(0);
  writeEmptyPackedPairs(bits);
  bits.writePackedU24(0);
  bits.writePackedU32(0);
  bits.writePackedU24(0);
  bits.writePackedU24(player.team);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writeString("");
  writeHeroSlots(bits, heroSlots, fallback);
};

const readPlayerUserId = (bits: BitReader, heroSlots: number): number => {
  bits.readPackedU32();
  bits.readString();
  bits.readString();
  bits.readPackedU32();
  bits.readPackedU32();
  const userId = bits.readPackedU32();
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
    bits.readPackedU32();
    bits.readPackedU32();
    bits.readBool();
    bits.readPackedU32();
    bits.readPackedU32();
    bits.readPackedU32();
  }
  return userId;
};

export const matchSetupOptionsFromSpec = (setup: MatchSetupSpec): MatchSetupEncodeOptions => ({
  hostHeroId: setup.hostHeroId,
  hostCostumeId: setup.hostCostumeId,
  hostHeroSlots: setup.hostHeroSlots,
  ruleset: setup.ruleset,
  guests: setup.guests,
  bots: setup.bots,
});

const rulesetFromOptions = rulesetFromArray;

export const encodeMatchSetup = (options: MatchSetupEncodeOptions): Uint8Array => {
  const ruleset = rulesetFromOptions(options.ruleset);
  const bits = new BitWriter();
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU24(STUB_UDP_CHANNEL);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(STUB_HERO_SLOTS);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writeBool(false);
  writeRuleset(bits, ruleset);
  const heroFallback = { heroId: options.hostHeroId, costumeId: options.hostCostumeId };
  const hostTeam = 1;
  writePlayer(
    bits,
    {
      name: STUB_DISPLAY_NAME,
      entityId: 1,
      userId: STUB_USER_ID,
      local: true,
      isBotRecord: false,
      botCostume: false,
      controller: 0,
      team: hostTeam,
      heroId: options.hostHeroId,
      costumeId: options.hostCostumeId,
    },
    options.hostHeroSlots,
    heroFallback,
  );
  let nextTeam = hostTeam + 1;
  for (const guest of options.guests) {
    const guestFallback = { heroId: guest.heroId, costumeId: guest.costumeId };
    const team = nextTeam;
    nextTeam += 1;
    writePlayer(
      bits,
      {
        name: STUB_DISPLAY_NAME,
        entityId: guest.entityId,
        userId: STUB_USER_ID,
        local: true,
        isBotRecord: false,
        botCostume: false,
        controller: guest.controller,
        team,
        heroId: guest.heroId,
        costumeId: guest.costumeId,
      },
      guest.heroSlots.length > 0 ? guest.heroSlots : [guestFallback],
      guestFallback,
    );
  }
  for (const bot of options.bots) {
    const botFallback = { heroId: bot.heroId, costumeId: bot.costumeId };
    const botTeam = nextTeam;
    nextTeam += 1;
    writePlayer(
      bits,
      {
        name: "Bot",
        entityId: bot.entityId,
        userId: 0,
        local: false,
        isBotRecord: true,
        botCostume: true,
        controller: bot.controller,
        team: botTeam,
        heroId: bot.heroId,
        costumeId: bot.costumeId,
      },
      [{ heroId: bot.heroId, costumeId: bot.costumeId }],
      botFallback,
    );
  }
  bits.writeBool(false);
  return bits.toUint8Array();
};

export const encodeMatchSetupLegacy = (options: { readonly includeBot: boolean }): Uint8Array =>
  encodeMatchSetup({
    hostHeroId: STUB_HERO_ID,
    hostCostumeId: STUB_COSTUME_ID,
    hostHeroSlots: [
      { heroId: STUB_HERO_ID, costumeId: STUB_COSTUME_ID },
      { heroId: STUB_HERO_ID, costumeId: STUB_COSTUME_ID },
    ],
    ruleset: [...DEFAULT_RULESET],
    guests: [],
    bots: options.includeBot
      ? [
          {
            controller: BOT_CONTROLLER,
            entityId: 2,
            heroId: STUB_HERO_ID,
            costumeId: STUB_COSTUME_ID,
          },
        ]
      : [],
  });

export const decodeMatchSetup = (payload: Uint8Array): MatchSetup => {
  const bits = new BitReader(payload);
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU24();
  const matchmaking = bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  const heroSlots = bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readBool();
  for (let i = 0; i < 15; i++) bits.readPackedU32();
  let playerCount = 0;
  let hostUserId = 0;
  while (bits.readBool()) {
    const userId = readPlayerUserId(bits, heroSlots);
    if (playerCount === 0) hostUserId = userId;
    playerCount += 1;
  }
  return {
    _tag: "MatchSetup",
    custom: matchmaking === 0,
    playerCount,
    hostUserId,
  };
};
