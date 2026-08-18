import { BitReader, BitWriter } from "./bitstream.ts";
import { STUB_USER_ID } from "./login-accepted.ts";

/** class_139.method_1011 TCP port for var_6810.Connect. */
export const STUB_GAME_TCP_PORT = 23011;
/** class_139.method_1011 UDP port for var_5009.Connect. */
export const STUB_GAME_UDP_PORT = 23012;
export const STUB_GAME_HOST = "127.0.0.1";
export const STUB_GAME_TOKEN = "gimped";
/** Non-zero LevelType id; 0 is rejected in LevelType.method_1323. */
export const STUB_LEVEL_ID = 1;

export type AssignGameServer = {
  readonly _tag: "AssignGameServer";
  readonly userId: number;
  readonly levelId: number;
  readonly token: string;
  readonly host: string;
  readonly tcpPort: number;
  readonly udpPort: number;
  readonly useNetworkNext: boolean;
};

/** LinkUpdater.method_3206 payload. */
export const encodeAssignGameServer = (): Uint8Array => {
  const bits = new BitWriter();
  bits.writePackedU32(STUB_USER_ID);
  bits.writePackedU32(STUB_LEVEL_ID);
  bits.writeString(STUB_GAME_TOKEN);
  bits.writeString(STUB_GAME_HOST);
  bits.writePackedU32(STUB_GAME_TCP_PORT);
  bits.writePackedU24(STUB_GAME_UDP_PORT);
  bits.writeBool(false);
  return bits.toUint8Array();
};

export const decodeAssignGameServer = (payload: Uint8Array): AssignGameServer => {
  const bits = new BitReader(payload);
  const userId = bits.readPackedU32();
  const levelId = bits.readPackedU32();
  const token = bits.readString();
  const host = bits.readString();
  const tcpPort = bits.readPackedU32();
  const udpPort = bits.readPackedU24();
  const useNetworkNext = bits.readBool();
  return {
    _tag: "AssignGameServer",
    userId,
    levelId,
    token,
    host,
    tcpPort,
    udpPort,
    useNetworkNext,
  };
};
