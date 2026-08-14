import type { IoError } from "@gimped/common";
import type {
  BuildIdNotFound,
  DepotDownloadFailed,
  FfdecFailed,
  KeyConflict,
  KeyNotFound,
  MalformedJson,
  MissingJava,
  MissingSteamCredentials,
  MissingSwf,
  PatchEvent,
  ToolDownloadFailed,
} from "@gimped/patch";
import { Context, Match, type Effect, type Stream } from "effect";
import type {
  FetchInProgress,
  NothingToClear,
  PatchFetchPayload,
  SafeStorageFailed,
  SettingsStatus,
  SteamGuardNotPending,
} from "../shared/client-rpc.ts";

export type PatchFetchError =
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
  | MalformedJson
  | FetchInProgress;

export class ClientApi extends Context.Service<
  ClientApi,
  {
    readonly patchFetch: (
      payload: typeof PatchFetchPayload.Type,
    ) => Stream.Stream<PatchEvent, PatchFetchError>;
    readonly patchClear: (payload: {
      readonly manifestId?: string;
      readonly cacheDir?: string;
    }) => Effect.Effect<void, IoError | NothingToClear>;
    readonly submitSteamGuard: (code: string) => Effect.Effect<void, SteamGuardNotPending>;
    readonly settingsGet: Effect.Effect<typeof SettingsStatus.Type, SafeStorageFailed>;
    readonly settingsSet: (
      username: string,
      password: string,
    ) => Effect.Effect<void, SafeStorageFailed>;
  }
>()("gimped/client/ClientApi") {}

export const patchFetchErrorDetail = Match.type<PatchFetchError>().pipe(
  Match.tagsExhaustive({
    MissingSteamCredentials: (error) => error.message,
    ToolDownloadFailed: (error) => error.message,
    MissingJava: (error) => error.message,
    DepotDownloadFailed: (error) => error.message,
    FfdecFailed: (error) => error.message,
    MissingSwf: (error) => error.path,
    KeyNotFound: (error) => error.path,
    BuildIdNotFound: (error) => error.path,
    KeyConflict: (error) => `${error.version}: ${error.existing} vs ${error.actual}`,
    IoError: (error) => error.message,
    MalformedJson: (error) => error.message,
    FetchInProgress: (error) => error.detail,
  }),
);

export const clearErrorDetail = Match.type<IoError | NothingToClear>().pipe(
  Match.tagsExhaustive({
    IoError: (error) => error.message,
    NothingToClear: (error) => error.detail,
  }),
);
