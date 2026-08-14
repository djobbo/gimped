import { toIoError, type IoError, type MalformedJson } from "@gimped/common";
import { Context, Effect, FileSystem, Layer, Path, PlatformError, Stdio } from "effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { CachePaths } from "./CachePaths.ts";
import { STEAM_APP_ID, STEAM_DEPOT_ID } from "./constants.ts";
import { DepotClient } from "./DepotClient.ts";
import {
  BuildIdNotFound,
  DepotDownloadFailed,
  FfdecFailed,
  KeyConflict,
  KeyNotFound,
  MissingJava,
  MissingSteamCredentials,
  MissingSwf,
  ToolDownloadFailed,
} from "./errors.ts";
import { Ffdec } from "./Ffdec.ts";
import { GithubRelease } from "./GithubRelease.ts";
import { KeyExtractor } from "./KeyExtractor.ts";
import type { PatchRegistry } from "./schemas.ts";
import { SteamCredentials } from "./SteamCredentials.ts";
import { ToolCache } from "./ToolCache.ts";
import { ToolPlatform } from "./ToolPlatform.ts";
import { VersionRegistry } from "./VersionRegistry.ts";

export type FetchOptions = {
  readonly cacheDir?: string;
  readonly manifestId?: string;
  readonly full: boolean;
  readonly versionKeysPath?: string;
};

export type PatchError =
  | MissingSteamCredentials
  | ToolDownloadFailed
  | MissingJava
  | DepotDownloadFailed
  | FfdecFailed
  | MissingSwf
  | KeyNotFound
  | BuildIdNotFound
  | KeyConflict
  | IoError
  | MalformedJson;

const isNotFound = (error: PlatformError.PlatformError): boolean =>
  error.reason._tag === "NotFound";

const emptyNames: ReadonlyArray<string> = [];

export class Pipeline extends Context.Service<
  Pipeline,
  {
    readonly fetch: (options: FetchOptions) => Effect.Effect<PatchRegistry, PatchError>;
  }
>()("@gimped/patch/Pipeline") {
  static readonly layer: Layer.Layer<
    Pipeline,
    never,
    | ToolCache
    | DepotClient
    | Ffdec
    | KeyExtractor
    | VersionRegistry
    | CachePaths
    | FileSystem.FileSystem
    | Path.Path
  > = Layer.effect(
    Pipeline,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const paths = yield* CachePaths;
      const tools = yield* ToolCache;
      const depot = yield* DepotClient;
      const ffdec = yield* Ffdec;
      const extractor = yield* KeyExtractor;
      const versions = yield* VersionRegistry;

      const listDepotMedia = Effect.fn("Pipeline.listDepotMedia")(function* (depotDir: string) {
        const entries = yield* fs
          .readDirectory(depotDir)
          .pipe(
            Effect.catch((error: PlatformError.PlatformError) =>
              isNotFound(error)
                ? Effect.succeed(emptyNames)
                : Effect.fail(toIoError(depotDir, error)),
            ),
          );
        return entries.filter((entry) => {
          const lower = entry.toLowerCase();
          return lower.endsWith(".swf") || lower.endsWith(".swz");
        });
      });

      const hasAsScripts = Effect.fn("Pipeline.hasAsScripts")(function* (scriptsDir: string) {
        const names = yield* fs
          .readDirectory(scriptsDir, { recursive: true })
          .pipe(
            Effect.catch((error: PlatformError.PlatformError) =>
              isNotFound(error)
                ? Effect.succeed(emptyNames)
                : Effect.fail(toIoError(scriptsDir, error)),
            ),
          );
        return names.some((name) => name.toLowerCase().endsWith(".as"));
      });

      const maybeMergeKeys = Effect.fn("Pipeline.maybeMergeKeys")(function* (
        options: FetchOptions,
        clientBuild: string,
        swzKey: number,
        publicLatest: boolean,
      ) {
        if (options.versionKeysPath === undefined) {
          return;
        }
        yield* versions.mergeVersionKeys(
          options.versionKeysPath,
          clientBuild,
          swzKey,
          publicLatest,
        );
      });

      const writeExtracted = Effect.fn("Pipeline.writeExtracted")(function* (
        options: FetchOptions,
        root: string,
        manifestId: string,
        depotDir: string,
        scriptsDir: string,
        swf: string,
        publicLatest: boolean,
      ) {
        const extracted = yield* extractor.extract(scriptsDir);
        const media = yield* listDepotMedia(depotDir);
        const files = media.length === 0 ? [swf] : media;
        const registry: PatchRegistry = {
          steamAppId: STEAM_APP_ID,
          steamDepotId: STEAM_DEPOT_ID,
          steamManifestId: manifestId,
          fullDepot: options.full,
          clientBuild: extracted.clientBuild,
          swzKey: extracted.swzKey,
          swf,
          files,
        };
        yield* versions.writePatch(root, registry, publicLatest);
        yield* maybeMergeKeys(options, extracted.clientBuild, extracted.swzKey, publicLatest);
        return registry;
      });

      const fetch = Effect.fn("Pipeline.fetch")(function* (options: FetchOptions) {
        const root = yield* paths.resolveRoot(options.cacheDir);
        yield* tools.ensureDepotDownloader(root);
        yield* tools.ensureJpexs(root);

        const publicLatest = options.manifestId === undefined;
        const manifestId =
          options.manifestId === undefined
            ? yield* depot.resolvePublicManifest(root)
            : options.manifestId;

        const existing = yield* versions.readPatch(root, manifestId);
        if (existing !== undefined) {
          if (publicLatest) {
            yield* versions.writePatch(root, existing, true);
          }
          yield* maybeMergeKeys(options, existing.clientBuild, existing.swzKey, publicLatest);
          return existing;
        }

        const depotDir = paths.depotDir(root, manifestId);
        const scriptsDir = paths.scriptsDir(root, manifestId);
        const media = yield* listDepotMedia(depotDir);
        const hasSwf = media.some((entry) => entry.toLowerCase().endsWith(".swf"));
        const hasAs = yield* hasAsScripts(scriptsDir);

        if (hasSwf && hasAs) {
          const swfPath = yield* ffdec.findSwf(depotDir);
          return yield* writeExtracted(
            options,
            root,
            manifestId,
            depotDir,
            scriptsDir,
            path.basename(swfPath),
            publicLatest,
          );
        }

        if (!hasSwf) {
          yield* depot.download(root, manifestId, options.full);
        }

        const swf = yield* ffdec.exportScripts(root, depotDir, scriptsDir);
        return yield* writeExtracted(
          options,
          root,
          manifestId,
          depotDir,
          scriptsDir,
          swf,
          publicLatest,
        );
      });

      return Pipeline.of({ fetch });
    }),
  );

  static readonly Default: Layer.Layer<
    | Pipeline
    | ToolCache
    | DepotClient
    | Ffdec
    | KeyExtractor
    | VersionRegistry
    | CachePaths
    | GithubRelease
    | ToolPlatform,
    never,
    | FileSystem.FileSystem
    | Path.Path
    | HttpClient.HttpClient
    | ChildProcessSpawner
    | Stdio.Stdio
    | SteamCredentials
  > = this.layer.pipe(
    Layer.provideMerge(DepotClient.layer),
    Layer.provideMerge(Ffdec.layer),
    Layer.provideMerge(ToolCache.layer),
    Layer.provideMerge(GithubRelease.layer),
    Layer.provideMerge(ToolPlatform.layer),
    Layer.provideMerge(KeyExtractor.layer),
    Layer.provideMerge(VersionRegistry.layer),
    Layer.provideMerge(CachePaths.layer),
  );
}

export const fetch = Effect.fn("fetch")(function* (options: FetchOptions) {
  const pipeline = yield* Pipeline;
  return yield* pipeline.fetch(options);
});
