import {
  ChecksumMismatch as SwzChecksumMismatch,
  InvalidSwz,
  SwzCodec,
  type SwzEntry,
  UnknownVersion,
  VersionKeys,
  XmlCodec,
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
  Schema,
} from "effect";
import type { AnimDef, BoneValue } from "./AnimDefJson.ts";
import { GameDataError } from "./errors.ts";

const asArray = <A>(value: A | ReadonlyArray<A> | undefined): ReadonlyArray<A> => {
  if (Predicate.isUndefined(value)) return Arr.empty();
  return Arr.Array.isArray(value) ? value : Arr.of(value);
};

const textValue = (node: unknown): string | undefined => {
  if (Predicate.isString(node) || Predicate.isNumber(node)) return String(node);
  if (Predicate.hasProperty(node, "#text")) {
    const text = node["#text"];
    if (Predicate.isString(text) || Predicate.isNumber(text)) return String(text);
  }
  return undefined;
};

const childTexts = (root: Readonly<Record<string, unknown>>): readonly string[] => {
  const boneTypes = root["BoneTypes"];
  if (
    !Predicate.isObject(boneTypes) ||
    Predicate.isNull(boneTypes) ||
    Arr.Array.isArray(boneTypes)
  ) {
    return [];
  }
  const names: string[] = [];
  for (const [key, value] of Rec.toEntries(boneTypes as Record<string, unknown>)) {
    if (key.startsWith("@_")) continue;
    for (const item of asArray(value as string | ReadonlyArray<unknown> | undefined)) {
      const text = textValue(item);
      if (text !== undefined) names.push(text);
    }
  }
  return names;
};

const looksLikeXml = (content: string): boolean => content.trimStart().startsWith("<");

const toGameDataError = (dataPath: string, error: unknown): GameDataError => {
  if (Schema.is(UnknownVersion)(error)) {
    return new GameDataError({ path: dataPath, message: `unknown version: ${error.version}` });
  }
  if (Schema.is(InvalidSwz)(error)) {
    return new GameDataError({ path: dataPath, message: error.reason });
  }
  if (Schema.is(SwzChecksumMismatch)(error)) {
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

const applyNames = (defs: readonly AnimDef[], names: readonly string[]): readonly AnimDef[] =>
  defs.map((def) => ({
    ...def,
    moves: def.moves.map((move) => ({
      ...move,
      frames: move.frames.map((frame) => ({
        ...frame,
        bones: frame.bones.map((bone): BoneValue => {
          const name = names[bone.id];
          return name === undefined ? bone : { ...bone, name };
        }),
      })),
    })),
  }));

const isSwzPath = (dataPath: string): boolean => dataPath.toLowerCase().endsWith(".swz");

export class BoneTypes extends Context.Service<
  BoneTypes,
  {
    readonly annotate: (
      defs: readonly AnimDef[],
      dataPath?: string,
    ) => Effect.Effect<readonly AnimDef[], GameDataError>;
  }
>()("@gimped/anm/BoneTypes") {
  static readonly none: Layer.Layer<BoneTypes> = Layer.succeed(
    BoneTypes,
    BoneTypes.of({
      annotate: Effect.fn("BoneTypes.annotate")((defs: readonly AnimDef[], _dataPath?: string) =>
        Effect.succeed(defs),
      ),
    }),
  );

  static readonly layer: Layer.Layer<
    BoneTypes,
    never,
    FileSystem.FileSystem | Path.Path | Crypto.Crypto
  > = Layer.effect(
    BoneTypes,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const codec = yield* SwzCodec;
      const versionKeys = yield* VersionKeys;
      const xml = yield* XmlCodec;

      const ingestXml = Effect.fn("BoneTypes.ingestXml")(function* (
        names: string[],
        found: { value: boolean },
        content: string,
        filePath: string,
      ) {
        yield* xml.xmlToJson(content, filePath).pipe(
          Effect.map((data) => {
            if (!("BoneTypes" in data.root)) return;
            found.value = true;
            names.push(...childTexts(data.root));
          }),
          Effect.orElseSucceed(() => undefined),
        );
      });

      const ingestDirectory = Effect.fn("BoneTypes.ingestDirectory")(function* (
        names: string[],
        found: { value: boolean },
        dataPath: string,
      ) {
        const fileNames = yield* fs
          .readDirectory(dataPath)
          .pipe(Effect.mapError((error) => toGameDataError(dataPath, error)));
        const ingestDirectoryFile = Effect.fn("BoneTypes.ingestDirectoryFile")(function* (
          name: string,
        ) {
          const filePath = path.join(dataPath, name);
          const content = yield* fs
            .readFileString(filePath)
            .pipe(Effect.orElseSucceed(() => undefined));
          if (content === undefined || !looksLikeXml(content)) return;
          yield* ingestXml(names, found, content, filePath);
        });
        yield* Effect.forEach(fileNames, ingestDirectoryFile);
      });

      const ingestSwz = Effect.fn("BoneTypes.ingestSwz")(function* (
        names: string[],
        found: { value: boolean },
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
        const ingestSwzEntry = Effect.fn("BoneTypes.ingestSwzEntry")(function* (
          entry: SwzEntry,
          index: number,
        ) {
          if (!looksLikeXml(entry.content)) return;
          yield* ingestXml(names, found, entry.content, `${dataPath}#${index}`);
        });
        yield* Effect.forEach(entries, ingestSwzEntry);
      });

      const annotate = Effect.fn("BoneTypes.annotate")(function* (
        defs: readonly AnimDef[],
        dataPath?: string,
      ) {
        if (dataPath === undefined) return defs;
        yield* fs.stat(dataPath).pipe(Effect.mapError((error) => toGameDataError(dataPath, error)));
        const names: string[] = [];
        const found = { value: false };
        yield* isSwzPath(dataPath)
          ? ingestSwz(names, found, dataPath)
          : ingestDirectory(names, found, dataPath);
        return applyNames(defs, found.value ? ["UNKNOWN", ...names] : []);
      });

      return BoneTypes.of({ annotate });
    }),
  ).pipe(
    Layer.provide(SwzCodec.Default),
    Layer.provide(VersionKeys.layer),
    Layer.provide(XmlCodec.layer),
  );
}
