import {
  ChecksumMismatch as SwzChecksumMismatch,
  InvalidSwz,
  SwzCodec,
  UnknownVersion,
  VersionKeys,
  XmlCodec,
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
  MutableHashMap,
  Option,
  Path,
  Predicate,
  Record as Rec,
  Schema,
} from "effect";
import { GameDataError } from "./errors.ts";
import type { Replay } from "./ReplayJson.ts";

type Tables = {
  readonly heroes: MutableHashMap.MutableHashMap<number, string>;
  readonly costumes: MutableHashMap.MutableHashMap<number, string>;
  readonly levels: MutableHashMap.MutableHashMap<number, string>;
  readonly scoring: MutableHashMap.MutableHashMap<number, string>;
  readonly colors: MutableHashMap.MutableHashMap<number, string>;
};

const emptyTables = (): Tables => ({
  heroes: MutableHashMap.empty(),
  costumes: MutableHashMap.empty(),
  levels: MutableHashMap.empty(),
  scoring: MutableHashMap.empty(),
  colors: MutableHashMap.empty(),
});

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

const setIfNamed = (
  map: MutableHashMap.MutableHashMap<number, string>,
  id: number | undefined,
  name: string | undefined,
): void => {
  if (id !== undefined && name !== undefined) MutableHashMap.set(map, id, name);
};

const ingestNode = (tables: Tables, node: XmlNode): void => {
  setIfNamed(
    tables.heroes,
    parseId(field(node, "HeroID")),
    attr(node, "HeroName") ?? childText(node, "HeroName"),
  );
  setIfNamed(tables.costumes, parseId(field(node, "CostumeID")), field(node, "CostumeName"));
  setIfNamed(
    tables.levels,
    parseId(field(node, "LevelID")),
    childText(node, "DisplayName") ?? attr(node, "LevelName") ?? childText(node, "LevelName"),
  );
  setIfNamed(
    tables.scoring,
    parseId(field(node, "ScoringID")),
    attr(node, "ScoringName") ?? childText(node, "ScoringName"),
  );
  setIfNamed(
    tables.colors,
    parseId(field(node, "ColorSchemeID")),
    attr(node, "ColorSchemeName") ?? childText(node, "ColorSchemeName"),
  );
};

const walk = (tables: Tables, node: XmlValue): void => {
  if (Predicate.isString(node) || Predicate.isNumber(node) || Predicate.isBoolean(node)) return;
  if (Arr.Array.isArray(node)) {
    for (const item of node) walk(tables, item);
    return;
  }
  ingestNode(tables, node);
  for (const value of Rec.values(node)) {
    if (value !== undefined) walk(tables, value);
  }
};

const looksLikeXml = (content: string): boolean => content.trimStart().startsWith("<");

const toGameDataError = (dataPath: string, cause: unknown): GameDataError => {
  if (Schema.is(UnknownVersion)(cause)) {
    return new GameDataError({ path: dataPath, message: `unknown version: ${cause.version}` });
  }
  if (Schema.is(InvalidSwz)(cause)) {
    return new GameDataError({ path: dataPath, message: cause.reason });
  }
  if (Schema.is(SwzChecksumMismatch)(cause)) {
    return new GameDataError({
      path: dataPath,
      message: `checksum mismatch (${cause.where}): expected ${cause.expected}, got ${cause.actual}`,
    });
  }
  return new GameDataError({
    path: dataPath,
    message: cause instanceof Error ? cause.message : String(cause),
  });
};

const named = (
  map: MutableHashMap.MutableHashMap<number, string>,
  id: number,
): string | undefined => Option.getOrUndefined(MutableHashMap.get(map, id));

const applyTables = (replay: Replay, tables: Tables): Replay => ({
  ...replay,
  rules: (() => {
    const scoringTypeName = named(tables.scoring, replay.rules.scoringTypeId);
    return scoringTypeName === undefined
      ? { ...replay.rules }
      : { ...replay.rules, scoringTypeName };
  })(),
  level: (() => {
    const name = named(tables.levels, replay.level.id);
    return name === undefined ? { ...replay.level } : { ...replay.level, name };
  })(),
  players: Arr.map(replay.players, (player) => {
    const colorSchemeName = named(tables.colors, player.colorSchemeId);
    const withColor =
      colorSchemeName === undefined ? { ...player } : { ...player, colorSchemeName };
    return {
      ...withColor,
      heroes: Arr.map(player.heroes, (hero) => {
        const heroName = named(tables.heroes, hero.heroId);
        const costumeName = named(tables.costumes, hero.costumeId);
        const withHero = heroName === undefined ? { ...hero } : { ...hero, heroName };
        return costumeName === undefined ? withHero : { ...withHero, costumeName };
      }),
    };
  }),
});

const isSwzPath = (dataPath: string): boolean => dataPath.toLowerCase().endsWith(".swz");

export class GameData extends Context.Service<
  GameData,
  {
    readonly annotate: (replay: Replay, dataPath?: string) => Effect.Effect<Replay, GameDataError>;
  }
>()("@gimped/replay/GameData") {
  static readonly none: Layer.Layer<GameData> = Layer.succeed(
    GameData,
    GameData.of({
      annotate: Effect.fn("GameData.annotate")((replay: Replay, _dataPath?: string) =>
        Effect.succeed(replay),
      ),
    }),
  );

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
        tables: Tables,
        content: string,
        filePath: string,
      ) {
        yield* xml.xmlToJson(content, filePath).pipe(
          Effect.map((data) => {
            walk(tables, data.root);
          }),
          Effect.orElseSucceed(() => undefined),
        );
      });

      const ingestDirectory = Effect.fn("GameData.ingestDirectory")(function* (
        tables: Tables,
        dataPath: string,
      ) {
        const names = yield* fs
          .readDirectory(dataPath)
          .pipe(Effect.mapError((error) => toGameDataError(dataPath, error)));
        yield* Effect.forEach(
          names,
          (name) =>
            Effect.gen(function* () {
              const filePath = path.join(dataPath, name);
              const content = yield* fs
                .readFileString(filePath)
                .pipe(Effect.orElseSucceed(() => undefined));
              if (content === undefined || !looksLikeXml(content)) return;
              yield* ingestXml(tables, content, filePath);
            }),
          { concurrency: "unbounded" },
        );
      });

      const ingestSwz = Effect.fn("GameData.ingestSwz")(function* (
        tables: Tables,
        dataPath: string,
      ) {
        const bytes = yield* fs
          .readFile(dataPath)
          .pipe(Effect.mapError((error) => toGameDataError(dataPath, error)));
        const key = yield* versionKeys
          .resolveKey("latest")
          .pipe(Effect.mapError((error) => toGameDataError(dataPath, error)));
        const entries = yield* codec
          .decompile(bytes, key)
          .pipe(Effect.mapError((error) => toGameDataError(dataPath, error)));
        yield* Effect.forEach(entries, (entry, index) => {
          if (!looksLikeXml(entry.content)) return Effect.void;
          return ingestXml(tables, entry.content, `${dataPath}#${index}`);
        });
      });

      const annotate = Effect.fn("GameData.annotate")(function* (
        replay: Replay,
        dataPath?: string,
      ) {
        if (dataPath === undefined) return replay;
        yield* fs.stat(dataPath).pipe(Effect.mapError((error) => toGameDataError(dataPath, error)));
        const tables = emptyTables();
        yield* isSwzPath(dataPath)
          ? ingestSwz(tables, dataPath)
          : ingestDirectory(tables, dataPath);
        return applyTables(replay, tables);
      });

      return GameData.of({ annotate });
    }),
  ).pipe(
    Layer.provide(SwzCodec.Default),
    Layer.provide(VersionKeys.layer),
    Layer.provide(XmlCodec.layer),
  );
}
