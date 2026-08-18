import { dumpNameByType } from "./dump-names.ts";

/** LinkUpdater packet type aliases derived from class_725.as assignments. */
export const PacketType = {
  /** var_9413 — excluded from seq in method_1350 */
  keepAlive: 16,
  /** var_14901 — Steam login after challenge (class_139 ~3456) */
  loginRequest: 20,
  /** var_1802 — first client version packet after TCP connect */
  clientVersion: 30,
  /** var_5874 — create custom room (LinkUpdater.method_944) */
  createCustomRoom: 33,
  /** var_4048 — host changed lobby ruleset (LinkUpdater.method_875) */
  updateSettings: 37,
  /** var_3770 — add/remove bot (LinkUpdater.method_6324 / method_7840) */
  addBot: 44,
  /** var_6923 — host clicked play in a custom room (class_104.method_8137) */
  startMatch: 55,
  /** var_2045 — alternate login packet when var_10808 */
  loginRequestAlt: 88,
  /** var_3163 — "Brawlhalla client to server protocol 1.0" */
  protocolHello: 178,
  /** method_1350: types below this take a seq unless excluded */
  seqBelow: 500,
  /** var_6494 — excluded from seq */
  seqExclude6494: 2463,
  /** var_1783 — login success / account sync (LinkUpdater.method_8795) */
  loginAccepted: 2431,
  /** var_11345 — custom lobby snapshot (LinkUpdater.method_4037) */
  customLobby: 2445,
  /** var_719 — settings ack (LinkUpdater.method_8229 / method_5878) */
  lobbySettings: 2448,
  /** var_13930 — player/bot joined (LinkUpdater.method_5838) */
  lobbyJoin: 2449,
  /** var_8382 — backend assigns game-server host/ports (method_3206) */
  assignGameServer: 2466,
  /** var_5141 — match setup (LinkUpdater.method_8488 → class_139.method_215) */
  matchSetup: 10310,
  /** var_3975 — game-server hello (class_139.method_5889) */
  gameConnect: 10405,
  /** var_14117 — excluded from seq in method_6265 */
  seqExclude14117: 2467,
  /** var_7394 — server login challenge string */
  loginChallenge: 12000,
  /** var_7469 — Authentication Refused. Offline Mode Only. */
  authRefused: 12001,
  /** var_4304 — disconnect / drop to offline */
  dropOffline: 12002,
  /** var_14380 — empty keepalive ping/pong */
  keepalivePing: 12100,
} as const;

const dumpName = (type: number): string | undefined => {
  if (!Object.hasOwn(dumpNameByType, type)) return undefined;
  // SAFETY: Object.hasOwn confirmed `type` is one of dumpNameByType's keys.
  return dumpNameByType[type as keyof typeof dumpNameByType];
};

export const nameForType = (type: number): string => {
  if (type === PacketType.keepAlive) return "keepAlive";
  if (type === PacketType.loginRequest) return "loginRequest";
  if (type === PacketType.clientVersion) return "clientVersion";
  if (type === PacketType.loginRequestAlt) return "loginRequestAlt";
  if (type === PacketType.protocolHello) return "protocolHello";
  if (type === PacketType.createCustomRoom) return "createCustomRoom";
  if (type === PacketType.updateSettings) return "updateSettings";
  if (type === PacketType.addBot) return "addBot";
  if (type === PacketType.startMatch) return "startMatch";
  if (type === PacketType.loginAccepted) return "loginAccepted";
  if (type === PacketType.customLobby) return "customLobby";
  if (type === PacketType.lobbySettings) return "lobbySettings";
  if (type === PacketType.lobbyJoin) return "lobbyJoin";
  if (type === PacketType.assignGameServer) return "assignGameServer";
  if (type === PacketType.matchSetup) return "matchSetup";
  if (type === PacketType.gameConnect) return "gameConnect";
  if (type === PacketType.loginChallenge) return "loginChallenge";
  if (type === PacketType.authRefused) return "authRefused";
  if (type === PacketType.dropOffline) return "dropOffline";
  if (type === PacketType.keepalivePing) return "keepalivePing";
  return dumpName(type) ?? `type_${type}`;
};
