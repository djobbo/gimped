import {
  ChecksumMismatch as SwzChecksumMismatch,
  InvalidSwz,
  SwzCodec,
  UnknownVersion,
  VersionKeys,
  xmlToJson,
} from "@gimped/swz";
import { Context, Crypto, Effect, FileSystem, Layer, Path } from "effect";
import { GameDataError } from "./errors.ts";
import type { Replay } from "./ReplayJson.ts";

type Tables = {
  readonly heroes: Map<number, string>;
  readonly costumes: Map<number, string>;
  readonly levels: Map<number, string>;
  readonly scoring: Map<number, string>;
  readonly colors: Map<number, string>;
};

const emptyTables = (): Tables => ({
  heroes: new Map(),
  costumes: new Map(),
  levels: new Map(),
  scoring: new Map(),
  colors: new Map(),
});

const asArray = <T>(value: T | readonly T[] | undefined): readonly T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const textValue = (node: unknown): string | undefined => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (node !== null && typeof node === "object" && "#text" in node) {
    const text = (node as Record<string, unknown>)["#text"];
    if (typeof text === "string" || typeof text === "number") return String(text);
  }
  return undefined;
};

const attr = (node: Record<string, unknown>, name: string): string | undefined => {
  const value = node[`@_${name}`];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
};

const childText = (node: Record<string, unknown>, name: string): string | undefined =>
  textValue(node[name]);

const field = (node: Record<string, unknown>, name: string): string | undefined =>
  attr(node, name) ?? childText(node, name);

const parseId = (value: string | undefined): number | undefined => {
  if (value === undefined || value === "") return undefined;
  const id = Number(value);
  return Number.isFinite(id) ? id : undefined;
};

const setIfNamed = (
  map: Map<number, string>,
  id: number | undefined,
  name: string | undefined,
): void => {
  if (id !== undefined && name !== undefined) map.set(id, name);
};

const ingestNode = (tables: Tables, node: Record<string, unknown>): void => {
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

const walk = (tables: Tables, node: unknown): void => {
  for (const item of asArray(node as Record<string, unknown> | readonly unknown[] | undefined)) {
    if (item === null || typeof item !== "object") continue;
    if (Array.isArray(item)) {
      walk(tables, item);
      continue;
    }
    const obj = item as Record<string, unknown>;
    ingestNode(tables, obj);
    for (const value of Object.values(obj)) walk(tables, value);
  }
};

const looksLikeXml = (content: string): boolean => content.trimStart().startsWith("<");

const ingestXml = (tables: Tables, content: string, filePath: string) =>
  xmlToJson(content, filePath).pipe(
    Effect.map((data) => {
      walk(tables, data.root);
    }),
    Effect.orElseSucceed(() => undefined),
  );

const toGameDataError = (dataPath: string, error: unknown): GameDataError => {
  if (error instanceof UnknownVersion) {
    return new GameDataError({ path: dataPath, message: `unknown version: ${error.version}` });
  }
  if (error instanceof InvalidSwz) {
    return new GameDataError({ path: dataPath, message: error.reason });
  }
  if (error instanceof SwzChecksumMismatch) {
    return new GameDataError({
      path: dataPath,
      message: `checksum mismatch (${error.where}): expected ${error.expected}, got ${error.actual}`,
    });
  }
  return new GameDataError({
    path: dataPath,
    message: error instanceof Error ? error.message : String(error),
  });
};

const applyTables = (replay: Replay, tables: Tables): Replay => ({
  ...replay,
  rules: tables.scoring.has(replay.rules.scoringTypeId)
    ? { ...replay.rules, scoringTypeName: tables.scoring.get(replay.rules.scoringTypeId)! }
    : { ...replay.rules },
  level: tables.levels.has(replay.level.id)
    ? { ...replay.level, name: tables.levels.get(replay.level.id)! }
    : { ...replay.level },
  players: replay.players.map((player) => {
    const colorSchemeName = tables.colors.get(player.colorSchemeId);
    return {
      ...player,
      ...(colorSchemeName === undefined ? {} : { colorSchemeName }),
      heroes: player.heroes.map((hero) => {
        const heroName = tables.heroes.get(hero.heroId);
        const costumeName = tables.costumes.get(hero.costumeId);
        return {
          ...hero,
          ...(heroName === undefined ? {} : { heroName }),
          ...(costumeName === undefined ? {} : { costumeName }),
        };
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
  ).pipe(Layer.provide(SwzCodec.Default), Layer.provide(VersionKeys.layer));
}
