import {
  BuildIdNotFound,
  DepotDownloadFailed,
  FfdecFailed,
  IoError,
  KeyConflict,
  KeyNotFound,
  MalformedJson,
  MissingJava,
  MissingSteamCredentials,
  MissingSwf,
  ToolDownloadFailed,
} from "@gimped/patch/errors";
import { PatchEvent } from "@gimped/patch/schemas";
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

export class FetchInProgress extends Schema.TaggedError<FetchInProgress>()("FetchInProgress", {
  detail: Schema.String,
}) {}
export class NothingToClear extends Schema.TaggedError<NothingToClear>()("NothingToClear", {
  detail: Schema.String,
}) {}
export class SteamGuardNotPending extends Schema.TaggedError<SteamGuardNotPending>()(
  "SteamGuardNotPending",
  { detail: Schema.String },
) {}
export class SafeStorageFailed extends Schema.TaggedError<SafeStorageFailed>()(
  "SafeStorageFailed",
  {
    detail: Schema.String,
  },
) {}

export const SettingsStatus = Schema.Struct({
  username: Schema.String,
  hasPassword: Schema.Boolean,
});

export const PatchFetchPayload = Schema.Struct({
  manifestId: Schema.optionalKey(Schema.String),
  full: Schema.Boolean,
  cacheDir: Schema.optionalKey(Schema.String),
  force: Schema.Boolean,
});

export class ClientRpcs extends RpcGroup.make(
  Rpc.make("PatchFetch", {
    payload: PatchFetchPayload.fields,
    success: PatchEvent,
    error: Schema.Union([
      MissingSteamCredentials,
      ToolDownloadFailed,
      MissingJava,
      DepotDownloadFailed,
      FfdecFailed,
      MissingSwf,
      KeyNotFound,
      BuildIdNotFound,
      KeyConflict,
      IoError,
      MalformedJson,
      FetchInProgress,
    ]),
    stream: true,
  }),
  Rpc.make("PatchClear", {
    payload: {
      manifestId: Schema.optionalKey(Schema.String),
      cacheDir: Schema.optionalKey(Schema.String),
    },
    error: Schema.Union([IoError, NothingToClear]),
  }),
  Rpc.make("SubmitSteamGuard", {
    payload: { code: Schema.String },
    error: SteamGuardNotPending,
  }),
  Rpc.make("SettingsGet", {
    success: SettingsStatus,
    error: SafeStorageFailed,
  }),
  Rpc.make("SettingsSet", {
    payload: { username: Schema.String, password: Schema.String },
    error: SafeStorageFailed,
  }),
) {}
