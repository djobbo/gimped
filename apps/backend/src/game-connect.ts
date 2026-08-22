import { BitReader, BitWriter } from "./bitstream.ts";

export type GameConnect = {
  readonly _tag: "GameConnect";
  readonly userId: number;
  readonly token: string;
};

export const encodeGameConnect = (connect: {
  readonly userId: number;
  readonly token: string;
}): Uint8Array => {
  const bits = new BitWriter();
  bits.writePackedU32(connect.userId);
  bits.writeString(connect.token);
  return bits.toUint8Array();
};

export const decodeGameConnect = (payload: Uint8Array): GameConnect => {
  const bits = new BitReader(payload);
  return { _tag: "GameConnect", userId: bits.readPackedU32(), token: bits.readString() };
};
