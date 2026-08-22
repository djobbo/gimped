import { BitReader, BitWriter } from "./bitstream.ts";

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
export const encodeAssignGameServer = (assigned: Omit<AssignGameServer, "_tag">): Uint8Array => {
  const bits = new BitWriter();
  bits.writePackedU32(assigned.userId);
  bits.writePackedU32(assigned.levelId);
  bits.writeString(assigned.token);
  bits.writeString(assigned.host);
  bits.writePackedU32(assigned.tcpPort);
  bits.writePackedU24(assigned.udpPort);
  bits.writeBool(assigned.useNetworkNext);
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
