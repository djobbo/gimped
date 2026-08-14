import { toIoError, toMalformedJson, type IoError, type MalformedJson } from "@gimped/common";
import { VersionKeyMap } from "@gimped/swz";
import { Clock, Context, Effect, FileSystem, Layer, Path, PlatformError, Schema } from "effect";
import { CachePaths } from "./CachePaths.ts";
import { KeyConflict } from "./errors.ts";
import {
  PatchIndexText,
  PatchRegistryText,
  type PatchIndex,
  type PatchRegistry,
} from "./schemas.ts";

const VersionKeyMapText = Schema.fromJsonString(VersionKeyMap, { space: 2 });

const isNotFound = (error: PlatformError.PlatformError): boolean =>
  error.reason._tag === "NotFound";

export class VersionRegistry extends Context.Service<
  VersionRegistry,
  {
    readonly readPatch: (
      root: string,
      manifestId: string,
    ) => Effect.Effect<PatchRegistry | undefined, IoError | MalformedJson>;
    readonly writePatch: (
      root: string,
      registry: PatchRegistry,
      publicLatest: boolean,
    ) => Effect.Effect<void, IoError | KeyConflict | MalformedJson>;
    readonly mergeVersionKeys: (
      versionKeysPath: string,
      clientBuild: string,
      swzKey: number,
      publicLatest: boolean,
    ) => Effect.Effect<void, IoError | KeyConflict | MalformedJson>;
  }
>()("@gimped/patch/VersionRegistry") {
  static readonly layer: Layer.Layer<
    VersionRegistry,
    never,
    FileSystem.FileSystem | Path.Path | Clock.Clock | CachePaths
  > = Layer.effect(
    VersionRegistry,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const paths = yield* CachePaths;

      const readFileStringOrUndefined = (
        filePath: string,
      ): Effect.Effect<string | undefined, IoError> =>
        fs.readFileString(filePath).pipe(
          Effect.map((text): string | undefined => text),
          Effect.catch((error: PlatformError.PlatformError) =>
            isNotFound(error) ? Effect.succeed(undefined) : Effect.fail(toIoError(filePath, error)),
          ),
        );

      const decodeText = <A, E, R>(
        filePath: string,
        decode: (text: string) => Effect.Effect<A, E, R>,
        text: string,
      ): Effect.Effect<A, MalformedJson, R> =>
        decode(text).pipe(Effect.mapError((error) => toMalformedJson(filePath, error)));

      const encodeText = <A, E, R>(
        filePath: string,
        encode: (value: A) => Effect.Effect<string, E, R>,
        value: A,
      ): Effect.Effect<string, MalformedJson, R> =>
        encode(value).pipe(Effect.mapError((error) => toMalformedJson(filePath, error)));

      const readPatch = Effect.fn("VersionRegistry.readPatch")(function* (
        root: string,
        manifestId: string,
      ) {
        const filePath = paths.registryPath(root, manifestId);
        const text = yield* readFileStringOrUndefined(filePath);
        if (text === undefined) {
          return undefined;
        }
        return yield* decodeText(filePath, Schema.decodeUnknownEffect(PatchRegistryText), text);
      });

      const writePatch = Effect.fn("VersionRegistry.writePatch")(function* (
        root: string,
        registry: PatchRegistry,
        publicLatest: boolean,
      ) {
        const filePath = paths.registryPath(root, registry.steamManifestId);
        const dir = path.dirname(filePath);
        yield* fs
          .makeDirectory(dir, { recursive: true })
          .pipe(Effect.mapError((error) => toIoError(dir, error)));

        const encoded = yield* encodeText(
          filePath,
          Schema.encodeUnknownEffect(PatchRegistryText),
          registry,
        );
        yield* fs
          .writeFileString(filePath, encoded)
          .pipe(Effect.mapError((error) => toIoError(filePath, error)));

        const indexPath = paths.indexPath(root);
        const indexText = yield* readFileStringOrUndefined(indexPath);
        const index: PatchIndex =
          indexText === undefined
            ? { patches: {} }
            : yield* decodeText(indexPath, Schema.decodeUnknownEffect(PatchIndexText), indexText);

        const millis = yield* Clock.currentTimeMillis;
        const next: PatchIndex = {
          ...(publicLatest
            ? { latestManifestId: registry.steamManifestId }
            : index.latestManifestId !== undefined
              ? { latestManifestId: index.latestManifestId }
              : {}),
          patches: {
            ...index.patches,
            [registry.steamManifestId]: {
              clientBuild: registry.clientBuild,
              swzKey: registry.swzKey,
              fetchedAt: new Date(millis).toISOString(),
            },
          },
        };

        const encodedIndex = yield* encodeText(
          indexPath,
          Schema.encodeUnknownEffect(PatchIndexText),
          next,
        );
        yield* fs
          .writeFileString(indexPath, encodedIndex)
          .pipe(Effect.mapError((error) => toIoError(indexPath, error)));
      });

      const mergeVersionKeys = Effect.fn("VersionRegistry.mergeVersionKeys")(function* (
        versionKeysPath: string,
        clientBuild: string,
        swzKey: number,
        publicLatest: boolean,
      ) {
        const text = yield* readFileStringOrUndefined(versionKeysPath);
        const map: VersionKeyMap =
          text === undefined
            ? { keys: {}, aliases: {} }
            : yield* decodeText(
                versionKeysPath,
                Schema.decodeUnknownEffect(VersionKeyMapText),
                text,
              );

        const existing = map.keys[clientBuild];
        if (existing !== undefined && existing >>> 0 !== swzKey >>> 0) {
          return yield* new KeyConflict({
            version: clientBuild,
            existing: existing >>> 0,
            actual: swzKey >>> 0,
          });
        }

        const next: VersionKeyMap = {
          keys: { ...map.keys, [clientBuild]: swzKey },
          aliases: publicLatest ? { ...map.aliases, latest: clientBuild } : { ...map.aliases },
        };

        const encoded = yield* encodeText(
          versionKeysPath,
          Schema.encodeUnknownEffect(VersionKeyMapText),
          next,
        );
        yield* fs
          .writeFileString(versionKeysPath, encoded)
          .pipe(Effect.mapError((error) => toIoError(versionKeysPath, error)));
      });

      return VersionRegistry.of({
        readPatch,
        writePatch,
        mergeVersionKeys,
      });
    }),
  );
}
