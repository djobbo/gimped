import { BitReader, BitWriter } from "./bitstream.ts";

/**
 * `class_309.var_7881` length: RegionTypes with AvailableForCustom=TRUE
 * (Template/Anonymous excluded). Order does not matter for a uniform flag.
 */
export const CUSTOM_REGION_COUNT = 9;

export const STUB_USER_ID = 1;
export const STUB_DISPLAY_NAME = "Gimped";

export type LoginAccepted = {
  readonly _tag: "LoginAccepted";
  readonly userId: number;
  readonly displayName: string;
};

const writeEmptyList = (bits: BitWriter): void => {
  bits.writeBool(false);
};

const expectEmptyList = (bits: BitReader, name: string): void => {
  if (bits.readBool()) throw new RangeError(`stub loginAccepted expected empty ${name}`);
};

/** LinkUpdater.method_8795 payload. Nested lists are empty; playlists are server-only. */
export const encodeLoginAccepted = (): Uint8Array => {
  const bits = new BitWriter();
  bits.writeString("");
  bits.writePackedU32(STUB_USER_ID);
  bits.writeBool(false);
  bits.writeString(STUB_DISPLAY_NAME);
  bits.writePackedU32(0);
  bits.writePackedU24(1);
  bits.writePackedU32(0);
  bits.writePackedU32(100);
  bits.writePackedU32(0);
  bits.writeString("");
  bits.writeString("");
  bits.writeString("");
  bits.writeU8(0);
  bits.writeBool(false);
  bits.writePackedU32(0);
  bits.writeBool(false);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  for (let i = 0; i < CUSTOM_REGION_COUNT; i++) bits.writeBool(true);
  writeEmptyList(bits);
  writeEmptyList(bits);
  bits.writeBool(false);
  writeEmptyList(bits);
  writeEmptyList(bits);
  writeEmptyList(bits);
  writeEmptyList(bits);
  writeEmptyList(bits);
  bits.writeBool(false);
  writeEmptyList(bits);
  writeEmptyList(bits);
  writeEmptyList(bits);
  bits.writePackedU32(0);
  bits.writeString("");
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writeBool(false);
  writeEmptyList(bits);
  bits.writePackedU32(0);
  bits.writeU8(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writePackedU32(0);
  bits.writeString("");
  bits.writeBool(false);
  return bits.toUint8Array();
};

/** Mirrors LinkUpdater.method_8795 so tests catch a short/misaligned stub payload. */
export const decodeLoginAccepted = (payload: Uint8Array): LoginAccepted => {
  const bits = new BitReader(payload);
  bits.readString();
  const userId = bits.readPackedU32();
  if (bits.readBool()) {
    bits.readBool();
    bits.readPackedU32();
  }
  const displayName = bits.readString();
  bits.readPackedU32();
  bits.readPackedU24();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readString();
  bits.readString();
  bits.readString();
  bits.readU8();
  bits.readBool();
  bits.readPackedU32();
  bits.readBool();
  bits.readPackedU32();
  bits.readPackedU32();
  for (let i = 0; i < CUSTOM_REGION_COUNT; i++) bits.readBool();
  expectEmptyList(bits, "rankedPlaylists");
  expectEmptyList(bits, "unrankedPlaylists");
  if (bits.readBool())
    throw new RangeError("stub loginAccepted expected no brawl-of-the-week playlist");
  expectEmptyList(bits, "eloList");
  expectEmptyList(bits, "heroStats");
  expectEmptyList(bits, "friends");
  expectEmptyList(bits, "heroLevels");
  expectEmptyList(bits, "recentPlayers");
  bits.readBool();
  expectEmptyList(bits, "ownedStore");
  expectEmptyList(bits, "ownedTaunts");
  expectEmptyList(bits, "ownedIds");
  bits.readPackedU32();
  bits.readString();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readBool();
  expectEmptyList(bits, "clientThemes");
  bits.readPackedU32();
  bits.readU8();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readPackedU32();
  bits.readString();
  if (bits.readBool()) {
    bits.readPackedU32();
    bits.readPackedU32();
    bits.readString();
    if (bits.readBool()) bits.readString();
  }
  return { _tag: "LoginAccepted", userId, displayName };
};
