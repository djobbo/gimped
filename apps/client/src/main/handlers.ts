import { toIoError } from "@gimped/common";
import {
  CachePaths,
  MissingSteamCredentials,
  PatchIndexText,
  Pipeline,
  SteamCredentials,
  SteamGuard,
} from "@gimped/patch";
import {
  Context,
  Deferred,
  Effect,
  FileSystem,
  Layer,
  Path,
  PlatformError,
  Ref,
  Schema,
  Stream,
} from "effect";
import {
  ClientRpcs,
  FetchInProgress,
  NothingToClear,
  SafeStorageFailed,
  SteamGuardNotPending,
} from "../shared/client-rpc.ts";
import { get, readCredentials, SafeStorage, set } from "./steam-store.ts";
import { findWorkspaceRoot, versionKeysPath } from "./workspace.ts";

export class SteamGuardSlot extends Context.Service<
  SteamGuardSlot,
  Ref.Ref<Deferred.Deferred<string> | undefined>
>()("gimped/client/SteamGuardSlot") {}

export const SteamGuardSlotLive = Layer.effect(
  SteamGuardSlot,
  Ref.make<Deferred.Deferred<string> | undefined>(undefined),
);

export const SteamGuardLive = Layer.effect(
  SteamGuard,
  Effect.gen(function* () {
    const slot = yield* SteamGuardSlot;
    return {
      requestCode: Effect.fn("SteamGuard.requestCode")(function* () {
        const deferred = yield* Deferred.make<string>();
        yield* Ref.set(slot, deferred);
        return yield* Deferred.await(deferred).pipe(
          Effect.onInterrupt(() => Ref.set(slot, undefined)),
        );
      })(),
    };
  }),
);

export const SteamCredentialsLive = Layer.effect(
  SteamCredentials,
  Effect.gen(function* () {
    const storage = yield* SafeStorage;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return {
      get: Effect.fn("SteamCredentials.get")(function* () {
        const stored = yield* readCredentials().pipe(
          Effect.provideService(SafeStorage, storage),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
          Effect.catchTag(
            "SafeStorageFailed",
            (error: SafeStorageFailed) => new MissingSteamCredentials({ message: error.detail }),
          ),
        );
        if (stored.username === "" || stored.password === "") {
          return yield* new MissingSteamCredentials({
            message: "Steam credentials are not set",
          });
        }
        return { username: stored.username, password: stored.password };
      })(),
    };
  }),
);

const emptyToUndefined = (value: string | undefined): string | undefined =>
  value === undefined || value === "" ? undefined : value;

const isNotFound = (error: PlatformError.PlatformError): boolean =>
  error.reason._tag === "NotFound";

export const makeHandlersLive = (startPaths: ReadonlyArray<string>) =>
  ClientRpcs.toLayer(
    Effect.gen(function* () {
      const pipeline = yield* Pipeline;
      const paths = yield* CachePaths;
      const fs = yield* FileSystem.FileSystem;
      const guardSlot = yield* SteamGuardSlot;
      const inFlight = yield* Ref.make(false);

      const readLatestManifestId = Effect.fn("handlers.readLatestManifestId")(function* (
        root: string,
      ) {
        const indexFile = paths.indexPath(root);
        const text = yield* fs
          .readFileString(indexFile)
          .pipe(
            Effect.catch((error: PlatformError.PlatformError) =>
              isNotFound(error)
                ? Effect.succeed(undefined)
                : Effect.fail(toIoError(indexFile, error)),
            ),
          );
        if (text === undefined) {
          return undefined;
        }
        const index = yield* Schema.decodeUnknownEffect(PatchIndexText)(text).pipe(
          Effect.mapError((error) => toIoError(indexFile, error)),
        );
        return index.latestManifestId;
      });

      return ClientRpcs.of({
        PatchFetch: (payload) =>
          Stream.unwrap(
            Effect.gen(function* () {
              const acquired = yield* Ref.modify(inFlight, (busy) => [!busy, true] as const);
              if (!acquired) {
                return Stream.fail(
                  new FetchInProgress({ detail: "A patch fetch is already in progress" }),
                );
              }

              yield* Effect.acquireRelease(Effect.void, () => Ref.set(inFlight, false));

              const status = yield* get().pipe(
                Effect.catchTag(
                  "SafeStorageFailed",
                  (error: SafeStorageFailed) =>
                    new MissingSteamCredentials({ message: error.detail }),
                ),
              );
              if (!status.hasPassword) {
                return Stream.fail(
                  new MissingSteamCredentials({ message: "Steam credentials are not set" }),
                );
              }

              const workspaceRoot = yield* findWorkspaceRoot(startPaths).pipe(
                Effect.mapError((error) => toIoError(startPaths[0] ?? ".", error)),
              );
              const keys =
                workspaceRoot === undefined
                  ? undefined
                  : yield* versionKeysPath(workspaceRoot).pipe(
                      Effect.mapError((error) =>
                        toIoError("packages/swz/src/version-keys.json", error),
                      ),
                    );

              return pipeline.fetchStream({
                full: payload.full,
                force: payload.force,
                manifestId: emptyToUndefined(payload.manifestId),
                cacheDir: emptyToUndefined(payload.cacheDir),
                versionKeysPath: keys,
              });
            }),
          ),
        PatchClear: ({ manifestId, cacheDir }) =>
          Effect.gen(function* () {
            const root = yield* paths.resolveRoot(emptyToUndefined(cacheDir));
            const id = emptyToUndefined(manifestId) ?? (yield* readLatestManifestId(root));
            if (id === undefined) {
              return yield* new NothingToClear({
                detail: "No manifest id and no latestManifestId in index.json",
              });
            }
            yield* pipeline.clearPatch(root, id);
          }),
        SubmitSteamGuard: ({ code }) =>
          Effect.gen(function* () {
            const deferred = yield* Ref.get(guardSlot);
            if (deferred === undefined) {
              return yield* new SteamGuardNotPending({
                detail: "No Steam Guard code is pending",
              });
            }
            yield* Ref.set(guardSlot, undefined);
            yield* Deferred.succeed(deferred, code);
          }),
        SettingsGet: () => get(),
        SettingsSet: ({ username, password }) => set(username, password),
      });
    }),
  );

export const HandlersLive = makeHandlersLive([process.cwd()]);
