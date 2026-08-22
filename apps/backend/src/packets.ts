import { Match } from "effect";
import { aliasesByType } from "./packet-aliases.generated.ts";
import { dumpNameByType } from "./dump-names.ts";

/**
 * Named packet type constants for code that references specific packets.
 * Full alias table: `aliasesByType` in `packet-aliases.generated.ts` (428 types from class_725.as).
 * Regenerate: `node --experimental-transform-types apps/backend/scripts/generate-packet-aliases.mts`
 */
export const PacketType = {
  keepAlive: 16,
  loginRequest: 20,
  clientVersion: 30,
  createCustomRoom: 33,
  updateSettings: 37,
  joinCustomRoom: 38,
  legendPick: 41,
  lockReady: 43,
  addBot: 44,
  lobbyTabPing: 47,
  startMatch: 55,
  localJoin: 80,
  /** Client → lobby: empty (LinkUpdater.method_5406 / var_12842). */
  leaveLobby: 81,
  /** Client → lobby: empty (class_518.method_7977 / LinkUpdater.var_5600). */
  exitScoreboard: 85,
  loginRequestAlt: 88,
  protocolHello: 178,
  /** Types below this take a seq unless excluded (LinkUpdater.method_1350). */
  seqBelow: 500,
  loginAccepted: 2431,
  /** LinkUpdater.method_6236 — hide scoreboard after client 85. */
  exitScoreboardResponse: 2402,
  /** LinkUpdater.method_7553 — self leave spectate/lobby (userId + bool). */
  recvSpectateLeave: 2412,
  /** LinkUpdater.method_5357 — someone left the custom lobby. */
  recvLeave: 2444,
  customLobby: 2445,
  lobbySettings: 2448,
  lobbyJoin: 2449,
  /** Excluded from seq in method_6265 */
  seqExclude6494: 2463,
  assignGameServer: 2466,
  /** Excluded from seq in method_6265 */
  seqExclude14117: 2467,
  /** Server → client: transfer failed (LinkUpdater.method_6725) */
  transferFailed: 10300,
  tickPulse: 10301,
  playerReconnect: 10302,
  playerDisconnect: 10303,
  entityState: 10304,
  inputHistory: 10305,
  matchEnd: 10306,
  entityRespawn: 10307,
  entityRollback: 10308,
  inputBroadcast: 10309,
  matchSetup: 10310,
  sessionSync: 10311,
  entitySpawn: 10312,
  gameServerReady: 10313,
  canQuitNoPenalty: 10314,
  entityPoke: 10315,
  udpTunnel: 10316,
  /** Client → game-server: user id + session token (class_139.method_1819) */
  gameServerHello: 10400,
  simReady: 10401,
  postConnectAck: 10403,
  tickAck: 10404,
  gameConnect: 10405,
  moveInput: 10407,
  levelReady: 10409,
  introPlayerSync: 10415,
  introEntitySync: 10419,
  introAuxSync: 10422,
  loginChallenge: 12000,
  authRefused: 12001,
  dropOffline: 12002,
  keepalivePing: 12100,
} as const;

const dumpName = (type: number): string | undefined => {
  if (!Object.hasOwn(dumpNameByType, type)) return undefined;
  // SAFETY: Object.hasOwn confirmed `type` is one of dumpNameByType's keys.
  return dumpNameByType[type as keyof typeof dumpNameByType];
};

const packetNameByType = new Map<number, string>(
  Object.entries(aliasesByType).map(([type, name]) => [Number(type), name]),
);

export const nameForType = (type: number): string =>
  Match.value(packetNameByType.get(type)).pipe(
    Match.when(Match.defined, (name) => name),
    Match.orElse(() => dumpName(type) ?? `type_${type}`),
  );

/** All known type ids with semantic or toExplore aliases. */
export { aliasesByType };
