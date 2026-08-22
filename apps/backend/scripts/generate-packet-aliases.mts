import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dumpNamesPath = path.join(root, "src/dump-names.ts");
const mapPath = path.join(root, "docs/linkupdater-map.json");
const deobPath = path.join(root, "docs/LinkUpdater.deobfuscated.as");
const obfPath = path.resolve(root, "../../../brawlhalla-src/dump/scripts/LinkUpdater.as");
const outPath = path.join(root, "src/packet-aliases.generated.ts");

/** Curated semantic names — override deob/auto aliases for backend code paths. */
const curated = {
  16: "keepAlive",
  19: "unused19",
  20: "loginRequest",
  30: "clientVersion",
  33: "createCustomRoom",
  37: "updateSettings",
  38: "joinCustomRoom",
  41: "legendPick",
  43: "lockReady",
  44: "addBot",
  47: "lobbyTabPing",
  55: "startMatch",
  70: "steamOverlayPing",
  71: "unused71",
  80: "localJoin",
  88: "loginRequestAlt",
  178: "protocolHello",
  500: "seqBelow",
  2300: "loginAcceptedAlt",
  2431: "loginAccepted",
  2433: "unused2433",
  2445: "customLobby",
  2448: "lobbySettings",
  2449: "lobbyJoin",
  2463: "seqExclude6494",
  2466: "assignGameServer",
  2467: "seqExclude14117",
  10300: "transferFailed",
  10301: "tickPulse",
  10302: "entReconnected",
  10303: "entDisconnected",
  10304: "entityState",
  10305: "inputHistory",
  10306: "matchEnd",
  10307: "entityRespawn",
  10308: "entityRollback",
  10309: "inputBroadcast",
  10310: "matchSetup",
  10311: "sessionSync",
  10312: "entitySpawn",
  10313: "gameserverReady",
  10314: "canQuitNoPenalty",
  10315: "entityPoke",
  10316: "udpTunnel",
  10400: "gameserverLogin",
  10401: "entReadyToStart",
  10403: "resynchReady",
  10404: "tickAck",
  10405: "gameserverLoginRejoin",
  10407: "moveInput",
  10409: "levelReady",
  10415: "introPlayerSync",
  10419: "introEntitySync",
  10422: "introAuxSync",
  12000: "loginChallenge",
  12001: "authRefused",
  12002: "exitGameserver",
  12100: "keepalivePing",
} as const satisfies Record<number, string>;

/** Handler-derived hints appended as comments in generated output. */
const handlerHints = {
  10300: "method_6725 Error_FAILED_TRANSFER",
  10301: "method_6892 tick pulse",
  10302: "ReadReconnectedEntity",
  10303: "ReadDisconnectedEntity",
  10304: "method_3520 stock/entity state",
  10309: "method_2963 rollback inputs",
  10310: "method_8497 match setup",
  10311: "method_8604 session sync",
  10312: "method_288 entity spawn loop",
  10313: "ReadGameServerReady",
  10316: "method_8562 UDP tunnel",
  10401: "WriteReadyToStartPacket quit/forfeit",
  10404: "method_2517 tick ack",
  12002: "method_7929 exit to offline/main menu",
} as const satisfies Record<number, string>;

const handlerHintFor = (type: number): string | undefined => {
  switch (type) {
    case 10300:
      return handlerHints[10300];
    case 10301:
      return handlerHints[10301];
    case 10302:
      return handlerHints[10302];
    case 10303:
      return handlerHints[10303];
    case 10304:
      return handlerHints[10304];
    case 10309:
      return handlerHints[10309];
    case 10310:
      return handlerHints[10310];
    case 10311:
      return handlerHints[10311];
    case 10312:
      return handlerHints[10312];
    case 10313:
      return handlerHints[10313];
    case 10316:
      return handlerHints[10316];
    case 10401:
      return handlerHints[10401];
    case 10404:
      return handlerHints[10404];
    case 12002:
      return handlerHints[12002];
    default:
      return undefined;
  }
};

/** Game-server var slots → PKTTYPE from deobfuscated LinkUpdater (no lobby maps[] entry). */
const pktTypeByVar = {
  var_9913: "PKTTYPE_GAMESERVER_LOGIN",
  var_3979: "PKTTYPE_GAMESERVER_LOGIN_REJOIN",
  var_14267: "PKTTYPE_ENT_READY_TO_START",
  var_4307: "PKTTYPE_EXIT_GAMESERVER",
  var_8431: "PKTTYPE_RESYNCH_READY",
  var_14932: "PKTTYPE_ENT_RECONNECTED",
  var_11942: "PKTTYPE_ENT_DISCONNECTED",
  var_3325: "PKTTYPE_GAMESERVER_READY",
} as const satisfies Record<string, string>;

const pktTypeToAlias = (pktType: string): string => {
  if (pktType.startsWith("PKTTYPE_UNUSED_")) {
    return pktType.replace("PKTTYPE_", "").toLowerCase();
  }
  const stripped = pktType.replace(/^PKTTYPE_/, "");
  const parts = stripped.toLowerCase().split("_");
  const [head, ...tail] = parts;
  return head! + tail.map((part) => part[0]!.toUpperCase() + part.slice(1)).join("");
};

const extractFunctionBody = (src: string, funcName: string): string | undefined => {
  const re = new RegExp(`public function ${funcName}\\([^)]*\\)[^{]*\\{`, "m");
  const match = re.exec(src);
  if (!match) return undefined;
  let depth = 0;
  let started = false;
  let body = "";
  for (let i = match.index + match[0].length - 1; i < src.length; i++) {
    const ch = src[i]!;
    if (ch === "{") {
      depth += 1;
      started = true;
    } else if (ch === "}") {
      depth -= 1;
    }
    if (started) body += ch;
    if (started && depth === 0) break;
  }
  return body;
};

const stringLiterals = (body: string): ReadonlyArray<string> =>
  [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);

const findDeobHandlerForObfMethod = (
  deobSrc: string,
  obfSrc: string,
  method: string,
): string | undefined => {
  const obfBody = extractFunctionBody(obfSrc, method);
  if (obfBody === undefined) return undefined;
  const obfStrings = stringLiterals(obfBody);
  if (obfStrings.length === 0) return undefined;

  let best: { func: string; score: number } | undefined;
  for (const match of deobSrc.matchAll(/public function (Read\w+|Broadcast\w+)\(/g)) {
    const func = match[1]!;
    const body = extractFunctionBody(deobSrc, func);
    if (body === undefined) continue;
    const deobStrings = stringLiterals(body);
    let score = 0;
    for (const obf of obfStrings) {
      for (const deob of deobStrings) {
        if (obf === deob) score += 10;
        else if (obf.includes(deob) || deob.includes(obf)) score += 3;
        else if (obf.toLowerCase().includes(deob.toLowerCase())) score += 1;
      }
    }
    if (score > 0 && (best === undefined || score > best.score)) {
      best = { func, score };
    }
  }
  return best?.func;
};

const parseDeobMaps = (src: string): ReadonlyMap<string, string> => {
  const handlerToPktType = new Map<string, string>();
  for (const match of src.matchAll(/maps\[LinkUpdater\.(PKTTYPE_\w+)\]\s*=\s*(\w+)/g)) {
    handlerToPktType.set(match[2]!, match[1]!);
  }
  return handlerToPktType;
};

const dumpSrc = fs.readFileSync(dumpNamesPath, "utf8");
const dumpEntries = [...dumpSrc.matchAll(/(\d+):\s*"([^"]+)"/g)].map((m) => ({
  type: Number(m[1]),
  varName: m[2]!,
}));

const mapRaw: unknown = JSON.parse(fs.readFileSync(mapPath, "utf8"));
// SAFETY: Written by this repo from LinkUpdater.as handler table extraction.
const map = mapRaw as {
  rows: ReadonlyArray<{ type: number; varName: string; handler: string | null }>;
  handlerByType: Record<string, string>;
  varNameToType: Record<string, number>;
};

const deobSrc = fs.readFileSync(deobPath, "utf8");
const obfSrc = fs.existsSync(obfPath) ? fs.readFileSync(obfPath, "utf8") : "";
const deobHandlerToPktType = parseDeobMaps(deobSrc);

const pktTypeNameByType = new Map<number, string>();
for (const row of map.rows) {
  if (row.varName in pktTypeByVar) {
    // SAFETY: Guarded by `in` immediately above.
    pktTypeNameByType.set(row.type, pktTypeByVar[row.varName as keyof typeof pktTypeByVar]);
  }
  if (row.handler === null) continue;
  if (pktTypeNameByType.has(row.type)) continue;
  const deobHandler =
    obfSrc.length > 0 ? findDeobHandlerForObfMethod(deobSrc, obfSrc, row.handler) : undefined;
  if (deobHandler !== undefined) {
    const pktType = deobHandlerToPktType.get(deobHandler);
    if (pktType !== undefined) {
      pktTypeNameByType.set(row.type, pktType);
    }
  }
}

const aliases: Record<number, string> = {};
for (const { type, varName } of dumpEntries) {
  if (curated[type]) {
    aliases[type] = curated[type]!;
    continue;
  }
  const pktType = pktTypeNameByType.get(type);
  if (pktType !== undefined) {
    aliases[type] = pktTypeToAlias(pktType);
    continue;
  }
  if (varName.startsWith("PKTTYPE_UNUSED")) {
    aliases[type] = varName.replace("PKTTYPE_", "").toLowerCase();
    continue;
  }
  aliases[type] = `toExplore_${varName}`;
}

const lines: string[] = [
  "/** Generated by scripts/generate-packet-aliases.mts — do not edit by hand. */",
  "export const aliasesByType = {",
];

for (const { type, varName } of dumpEntries) {
  const alias = aliases[type]!;
  const handler = map.handlerByType[String(type)];
  const hint = handlerHintFor(type);
  const pktType = pktTypeNameByType.get(type);
  const parts = [`/** ${varName}`];
  if (pktType !== undefined) parts.push(` ${pktType}`);
  if (handler) parts.push(` handler ${handler}`);
  if (hint) parts.push(` — ${hint}`);
  parts.push(" */");
  lines.push(`  ${parts.join("")}`);
  lines.push(`  ${type}: "${alias}",`);
}

lines.push("} as const satisfies Record<number, string>;");
lines.push("");
lines.push("export type PacketAlias = (typeof aliasesByType)[keyof typeof aliasesByType];");

fs.writeFileSync(outPath, lines.join("\n"));
console.log(
  `wrote ${outPath} (${dumpEntries.length} entries, ${pktTypeNameByType.size} deob PKTTYPE names)`,
);
