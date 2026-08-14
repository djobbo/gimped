import { toIoError, type IoError, type MalformedJson } from "@gimped/common";
import {
  Context,
  Effect,
  FileSystem,
  Layer,
  Path,
  PlatformError,
  Queue,
  Ref,
  Stdio,
  Stream,
} from "effect";
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
import { PatchReporter } from "./PatchReporter.ts";
import type { PatchEvent, PatchRegistry, PatchStep } from "./schemas.ts";
import { SteamCredentials } from "./SteamCredentials.ts";
import { ToolCache } from "./ToolCache.ts";
import { ToolPlatform } from "./ToolPlatform.ts";
import { VersionRegistry } from "./VersionRegistry.ts";

export type FetchOptions = {
  readonly cacheDir?: string;
  readonly manifestId?: string;
  readonly full: boolean;
  readonly force: boolean;
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

const registrySkipSteps: ReadonlyArray<PatchStep> = [
  "DownloadDepot",
  "ExportScripts",
  "ExtractKeys",
  "WriteRegistry",
];

export class Pipeline extends Context.Service<
  Pipeline,
  {
    readonly fetch: (options: FetchOptions) => Effect.Effect<PatchRegistry, PatchError>;
    readonly fetchStream: (options: FetchOptions) => Stream.Stream<PatchEvent, PatchError>;
    readonly clearPatch: (root: string, manifestId: string) => Effect.Effect<void, IoError>;
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

      const removePatchDir = Effect.fn("Pipeline.removePatchDir")(function* (
        root: string,
        manifestId: string,
      ) {
        const dir = paths.patchDir(root, manifestId);
        yield* fs
          .remove(dir, { recursive: true })
          .pipe(
            Effect.catch((error: PlatformError.PlatformError) =>
              isNotFound(error) ? Effect.void : Effect.fail(toIoError(dir, error)),
            ),
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
        const reporter = yield* PatchReporter;
        yield* reporter.emit({ _tag: "StepStarted", step: "ExtractKeys" });
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
        yield* reporter.emit({ _tag: "StepStarted", step: "WriteRegistry" });
        yield* versions.writePatch(root, registry, publicLatest);
        yield* maybeMergeKeys(options, extracted.clientBuild, extracted.swzKey, publicLatest);
        return registry;
      });

      const runFetch = Effect.fn("Pipeline.runFetch")(function* (
        options: FetchOptions,
        manifestRef: Ref.Ref<string | undefined>,
      ) {
        const reporter = yield* PatchReporter;
        const root = yield* paths.resolveRoot(options.cacheDir);
        yield* reporter.emit({ _tag: "StepStarted", step: "EnsureDepotDownloader" });
        yield* tools.ensureDepotDownloader(root);
        yield* reporter.emit({ _tag: "StepStarted", step: "EnsureJpexs" });
        yield* tools.ensureJpexs(root);

        yield* reporter.emit({ _tag: "StepStarted", step: "ResolveManifest" });
        const publicLatest = options.manifestId === undefined;
        const manifestId =
          options.manifestId === undefined
            ? yield* depot.resolvePublicManifest(root)
            : options.manifestId;
        yield* Ref.set(manifestRef, manifestId);

        const existing = yield* versions.readPatch(root, manifestId);
        if (!options.force && existing !== undefined) {
          for (const step of registrySkipSteps) {
            yield* reporter.emit({
              _tag: "StepSkipped",
              step,
              reason: "registry exists",
            });
          }
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

        if (!options.force && hasSwf && hasAs) {
          yield* reporter.emit({
            _tag: "StepSkipped",
            step: "DownloadDepot",
            reason: "depot already present",
          });
          yield* reporter.emit({
            _tag: "StepSkipped",
            step: "ExportScripts",
            reason: "scripts already present",
          });
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

        if (options.force || !hasSwf) {
          yield* reporter.emit({ _tag: "StepStarted", step: "DownloadDepot" });
          yield* depot.download(root, manifestId, options.full);
        } else {
          yield* reporter.emit({
            _tag: "StepSkipped",
            step: "DownloadDepot",
            reason: "depot already present",
          });
        }

        yield* reporter.emit({ _tag: "StepStarted", step: "ExportScripts" });
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

      const maybeDeleteIncomplete = Effect.fn("Pipeline.maybeDeleteIncomplete")(function* (
        options: FetchOptions,
        manifestRef: Ref.Ref<string | undefined>,
      ) {
        const id = options.manifestId ?? (yield* Ref.get(manifestRef));
        if (id === undefined) {
          return;
        }
        const root = yield* paths.resolveRoot(options.cacheDir);
        const existing = yield* versions
          .readPatch(root, id)
          .pipe(Effect.catchTag("MalformedJson", () => Effect.succeed(undefined)));
        if (existing !== undefined) {
          return;
        }
        yield* removePatchDir(root, id);
      });

      const fetchStream = (options: FetchOptions): Stream.Stream<PatchEvent, PatchError> =>
        Stream.callback<PatchEvent, PatchError>((queue) =>
          Effect.gen(function* () {
            const manifestRef = yield* Ref.make<string | undefined>(options.manifestId);
            const reporter = PatchReporter.of({
              emit: (event) => Queue.offer(queue, event).pipe(Effect.asVoid),
            });
            const registry = yield* runFetch(options, manifestRef).pipe(
              Effect.provideService(PatchReporter, reporter),
              Effect.onInterrupt(() =>
                Effect.uninterruptible(maybeDeleteIncomplete(options, manifestRef)),
              ),
            );
            yield* Queue.offer(queue, { _tag: "Completed", registry });
            yield* Queue.end(queue);
          }),
        );

      const fetch = Effect.fn("Pipeline.fetch")(function* (options: FetchOptions) {
        const events = yield* Stream.runCollect(fetchStream(options));
        const completed = events.find((event) => event._tag === "Completed");
        if (completed === undefined || completed._tag !== "Completed") {
          return yield* Effect.die("Pipeline.fetch: stream ended without Completed");
        }
        return completed.registry;
      });

      const clearPatch = Effect.fn("Pipeline.clearPatch")(function* (
        root: string,
        manifestId: string,
      ) {
        yield* removePatchDir(root, manifestId);
      });

      return Pipeline.of({
        fetch,
        fetchStream,
        clearPatch,
      });
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

export const fetchStream = Effect.fn("fetchStream")(function* (options: FetchOptions) {
  const pipeline = yield* Pipeline;
  return pipeline.fetchStream(options);
});

export const clearPatch = Effect.fn("clearPatch")(function* (root: string, manifestId: string) {
  const pipeline = yield* Pipeline;
  return yield* pipeline.clearPatch(root, manifestId);
});
