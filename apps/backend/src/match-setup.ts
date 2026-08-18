import { BitReader, BitWriter } from "./bitstream.ts";
import { BOT_CONTROLLER, writeTimedRuleset } from "./custom-lobby.ts";
import { STUB_DISPLAY_NAME, STUB_USER_ID } from "./login-accepted.ts";

export type MatchSetup = {
  readonly _tag: "MatchSetup";
  readonly custom: boolean;
  readonly playerCount: number;
  readonly hostUserId: number;
};

const writeEmptyPackedPairs = (bits: BitWriter): void => {
  bits.writeBool(false);
};

const writePlayer = (
  bits: BitWriter,
  player: {
    readonly name: string;
    readonly entityId: number;
    readonly userId: number;
    readonly local: boolean;
    readonly botCostume: boolean;
    readonly controller: number;
  },
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
  bits.writeBool(false);
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
  bits.writePackedU24(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writeString("");
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

export const encodeMatchSetup = (options: { readonly includeBot: boolean }): Uint8Array => {
  const bits = new BitWriter();
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU24(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writeBool(false);
  writeTimedRuleset(bits);
  writePlayer(bits, {
    name: STUB_DISPLAY_NAME,
    entityId: 1,
    userId: STUB_USER_ID,
    local: true,
    botCostume: false,
    controller: 0,
  });
  if (options.includeBot) {
    writePlayer(bits, {
      name: "Bot",
      entityId: 2,
      userId: 0,
      local: false,
      botCostume: true,
      controller: BOT_CONTROLLER,
    });
  }
  bits.writeBool(false);
  return bits.toUint8Array();
};

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
