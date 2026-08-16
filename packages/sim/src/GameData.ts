import { toIoError, type IoError } from "@gimped/common";
import {
  SwzCodec,
  VersionKeys,
  XmlCodec,
  type ChecksumMismatch,
  type InvalidSwz,
  type MalformedXml,
  type UnknownVersion,
  type XmlNode,
  type XmlValue,
} from "@gimped/swz";
import {
  Array as Arr,
  Context,
  Crypto,
  Effect,
  FileSystem,
  Layer,
  Path,
  Predicate,
  Record as Rec,
} from "effect";
import type {
  CameraBounds,
  CollisionLine,
  LevelCollisionData,
  Spawn,
  TablesData,
} from "./domain.ts";
import { MissingCollision, type MissingTables } from "./errors.ts";

type LevelDescRow = {
  readonly levelId: number | undefined;
  readonly levelName: string | undefined;
  readonly lines: CollisionLine[];
  readonly spawns: Spawn[];
  readonly bounds: CameraBounds;
};

type Ingested = {
  readonly tables: TablesData;
  readonly descs: LevelDescRow[];
};

export type GameDataLoadError =
  | IoError
  | MissingTables
  | MissingCollision
  | MalformedXml
  | ChecksumMismatch
  | InvalidSwz
  | UnknownVersion;

const emptyTables = (): TablesData => ({
  scoring: new Map(),
  heroes: new Map(),
  hurtboxes: new Map(),
  powers: new Map(),
  levels: new Map(),
  stats: new Map(),
});

const emptyIngested = (): Ingested => ({ tables: emptyTables(), descs: [] });

const textValue = (node: XmlValue | undefined): string | undefined => {
  if (Predicate.isUndefined(node)) return undefined;
  if (Predicate.isString(node) || Predicate.isNumber(node)) return String(node);
  if (Arr.Array.isArray(node) || Predicate.isBoolean(node)) return undefined;
  if (Predicate.hasProperty(node, "#text")) {
    const text = node["#text"];
    if (Predicate.isString(text) || Predicate.isNumber(text)) return String(text);
  }
  return undefined;
};

const attr = (node: XmlNode, name: string): string | undefined => {
  const value = node[`@_${name}`];
  return Predicate.isString(value) || Predicate.isNumber(value) ? String(value) : undefined;
};

const childText = (node: XmlNode, name: string): string | undefined => textValue(node[name]);

const field = (node: XmlNode, name: string): string | undefined =>
  attr(node, name) ?? childText(node, name);

const parseId = (value: string | undefined): number | undefined => {
  if (Predicate.isUndefined(value) || value === "") return undefined;
  const id = Number(value);
  return Number.isFinite(id) ? id : undefined;
};

const parseNum = (value: string | undefined): number | undefined => parseId(value);

const firstCsvNum = (value: string | undefined): number | undefined =>
  parseNum(value?.split(",")[0]?.trim());

const isXmlNode = (value: XmlValue): value is XmlNode =>
  !Predicate.isString(value) &&
  !Predicate.isNumber(value) &&
  !Predicate.isBoolean(value) &&
  !Arr.Array.isArray(value);

const asNodes = (value: XmlValue | undefined): XmlNode[] => {
  if (Predicate.isUndefined(value)) return [];
  if (Arr.Array.isArray(value)) return value.filter(isXmlNode);
  return isXmlNode(value) ? [value] : [];
};

const looksLikeXml = (content: string): boolean => content.trimStart().startsWith("<");

const isSwzPath = (dataPath: string): boolean => dataPath.toLowerCase().endsWith(".swz");

const ingestTables = (tables: TablesData, node: XmlNode): void => {
  const scoringId = parseId(field(node, "ScoringID") ?? field(node, "ScoringTypeID"));
  const scoringName = field(node, "ScoringName") ?? field(node, "ScoringTypeName");
  if (scoringId !== undefined && scoringName !== undefined) {
    tables.scoring.set(scoringId, { id: scoringId, name: scoringName });
  }

  const heroId = parseId(field(node, "HeroID"));
  const heroName = field(node, "HeroName");
  if (heroId !== undefined && heroName !== undefined) {
    tables.heroes.set(heroId, {
      id: heroId,
      name: heroName,
      strength: parseNum(field(node, "Strength")),
      dexterity: parseNum(field(node, "Dexterity")),
      weight: parseNum(field(node, "Weight")),
      speed: parseNum(field(node, "Speed")),
    });
  }

  const statName = field(node, "StatName");
  if (statName !== undefined && statName !== "Template") {
    const xmlRecover = parseNum(field(node, "RecoverMod"));
    tables.stats.set(statName, {
      name: statName,
      runSpeed: parseNum(field(node, "RunSpeed")),
      impulseMult: parseNum(field(node, "ImpulseMult")),
      recoverMod: xmlRecover !== undefined && xmlRecover !== 0 ? 1 / xmlRecover : undefined,
      recovery: parseNum(field(node, "Recovery")),
    });
  }

  const hurtName = field(node, "HurtboxName");
  const width = firstCsvNum(field(node, "Width"));
  const height = firstCsvNum(field(node, "Height"));
  if (hurtName !== undefined && width !== undefined && height !== undefined) {
    tables.hurtboxes.set(hurtName, { name: hurtName, width, height });
  }

  const powerId = parseId(field(node, "PowerID"));
  const powerName = field(node, "PowerName");
  if (powerId !== undefined && powerName !== undefined) {
    tables.powers.set(powerId, { id: powerId, name: powerName });
  }

  const levelId = parseId(field(node, "LevelID"));
  // Dump LevelType: `LevelName` is the map key (`LevelType.as:256`); `DisplayName` is UI text.
  const levelName = field(node, "LevelName") ?? field(node, "DisplayName");
  if (levelId !== undefined && levelName !== undefined) {
    tables.levels.set(levelId, { id: levelId, name: levelName });
  }
};

const parseLine = (node: XmlNode, type: 1 | 2): CollisionLine | undefined => {
  const x = parseNum(field(node, "X"));
  const y = parseNum(field(node, "Y"));
  const startX = parseNum(field(node, "X1")) ?? x;
  const startY = parseNum(field(node, "Y1")) ?? y;
  const endX = parseNum(field(node, "X2")) ?? x;
  const endY = parseNum(field(node, "Y2")) ?? y;
  if (startX === undefined || startY === undefined || endX === undefined || endY === undefined) {
    return undefined;
  }
  return { startX, startY, endX, endY, type };
};

const parseSpawn = (node: XmlNode): Spawn => {
  const x = parseNum(field(node, "X")) ?? 0;
  const y = parseNum(field(node, "Y")) ?? 0;
  const team = parseId(field(node, "Team"));
  if (team === undefined) return { x, y };
  return { x, y, team };
};

const parseBounds = (node: XmlNode | undefined): CameraBounds => ({
  x: parseNum(node === undefined ? undefined : field(node, "X")) ?? 0,
  y: parseNum(node === undefined ? undefined : field(node, "Y")) ?? 0,
  w: parseNum(node === undefined ? undefined : field(node, "W")) ?? 0,
  h: parseNum(node === undefined ? undefined : field(node, "H")) ?? 0,
});

const parseLevelDesc = (node: XmlNode): LevelDescRow => {
  const lines: CollisionLine[] = [];
  for (const child of asNodes(node.HardCollision)) {
    const line = parseLine(child, 1);
    if (line !== undefined) lines.push(line);
  }
  for (const child of asNodes(node.SoftCollision)) {
    const line = parseLine(child, 2);
    if (line !== undefined) lines.push(line);
  }
  return {
    levelId: parseId(field(node, "LevelID")),
    levelName: field(node, "LevelName"),
    lines,
    spawns: asNodes(node.Respawn).map(parseSpawn),
    bounds: parseBounds(asNodes(node.CameraBounds)[0]),
  };
};

const walk = (ingested: Ingested, node: XmlValue, tag?: string): void => {
  if (Predicate.isString(node) || Predicate.isNumber(node) || Predicate.isBoolean(node)) return;
  if (Arr.Array.isArray(node)) {
    for (const item of node) walk(ingested, item, tag);
    return;
  }
  if (tag === "LevelDesc") ingested.descs.push(parseLevelDesc(node));
  ingestTables(ingested.tables, node);
  for (const [key, value] of Rec.toEntries(node)) {
    if (value !== undefined) walk(ingested, value, key);
  }
};

const resolveLevel = (ingested: Ingested, levelId: number): LevelCollisionData | undefined => {
  const named = ingested.tables.levels.get(levelId)?.name;
  const desc = ingested.descs.find(
    (row) => row.levelId === levelId || (named !== undefined && row.levelName === named),
  );
  if (desc === undefined || desc.lines.length === 0) return undefined;
  return {
    levelId,
    lines: desc.lines,
    spawns: desc.spawns,
    bounds: desc.bounds,
  };
};

export class GameData extends Context.Service<
  GameData,
  {
    readonly load: (
      dataPath: string,
      levelId: number,
    ) => Effect.Effect<{ tables: TablesData; level: LevelCollisionData }, GameDataLoadError>;
  }
>()("@gimped/sim/GameData") {
  static readonly layer: Layer.Layer<
    GameData,
    never,
    FileSystem.FileSystem | Path.Path | Crypto.Crypto
  > = Layer.effect(
    GameData,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const codec = yield* SwzCodec;
      const versionKeys = yield* VersionKeys;
      const xml = yield* XmlCodec;

      const ingestXml = Effect.fn("GameData.ingestXml")(function* (
        ingested: Ingested,
        content: string,
        filePath: string,
      ) {
        const data = yield* xml.xmlToJson(content, filePath);
        walk(ingested, data.root);
      });

      const ingestDirectory = Effect.fn("GameData.ingestDirectory")(function* (
        ingested: Ingested,
        dataPath: string,
      ) {
        const names = yield* fs
          .readDirectory(dataPath)
          .pipe(Effect.mapError((error) => toIoError(dataPath, error)));
        yield* Effect.forEach(
          names,
          (name) =>
            Effect.gen(function* () {
              const filePath = path.join(dataPath, name);
              if (isSwzPath(name)) {
                yield* ingestSwz(ingested, filePath);
                return;
              }
              const content = yield* fs
                .readFileString(filePath)
                .pipe(Effect.orElseSucceed(() => undefined));
              if (content === undefined || !looksLikeXml(content)) return;
              yield* ingestXml(ingested, content, filePath);
            }),
          { concurrency: "unbounded" },
        );
      });

      const ingestSwz = Effect.fn("GameData.ingestSwz")(function* (
        ingested: Ingested,
        dataPath: string,
      ) {
        const bytes = yield* fs
          .readFile(dataPath)
          .pipe(Effect.mapError((error) => toIoError(dataPath, error)));
        const key = yield* versionKeys.resolveKey("latest");
        const entries = yield* codec.decompile(bytes, key);
        yield* Effect.forEach(entries, (entry, index) => {
          if (!looksLikeXml(entry.content)) return Effect.void;
          return ingestXml(ingested, entry.content, `${dataPath}#${index}`).pipe(
            Effect.catchTag("MalformedXml", () => Effect.void),
          );
        });
      });

      const load = Effect.fn("GameData.load")(function* (dataPath: string, levelId: number) {
        yield* fs.stat(dataPath).pipe(Effect.mapError((error) => toIoError(dataPath, error)));
        const ingested = emptyIngested();
        yield* isSwzPath(dataPath)
          ? ingestSwz(ingested, dataPath)
          : ingestDirectory(ingested, dataPath);
        const level = resolveLevel(ingested, levelId);
        if (level === undefined) {
          return yield* new MissingCollision({ levelId });
        }
        return { tables: ingested.tables, level };
      });

      return GameData.of({ load });
    }),
  ).pipe(
    Layer.provide(SwzCodec.Default),
    Layer.provide(VersionKeys.layer),
    Layer.provide(XmlCodec.layer),
  );
}
