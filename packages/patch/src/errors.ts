import { Schema } from "effect";

export { IoError, MalformedJson } from "@gimped/common";

export class MissingSteamCredentials extends Schema.TaggedError<MissingSteamCredentials>()(
  "MissingSteamCredentials",
  { message: Schema.String },
) {}

export class ToolDownloadFailed extends Schema.TaggedError<ToolDownloadFailed>()(
  "ToolDownloadFailed",
  {
    message: Schema.String,
  },
) {}

export class MissingJava extends Schema.TaggedError<MissingJava>()("MissingJava", {
  message: Schema.String,
}) {}

export class DepotDownloadFailed extends Schema.TaggedError<DepotDownloadFailed>()(
  "DepotDownloadFailed",
  {
    message: Schema.String,
  },
) {}

export class FfdecFailed extends Schema.TaggedError<FfdecFailed>()("FfdecFailed", {
  message: Schema.String,
}) {}

export class MissingSwf extends Schema.TaggedError<MissingSwf>()("MissingSwf", {
  path: Schema.String,
}) {}

export class KeyNotFound extends Schema.TaggedError<KeyNotFound>()("KeyNotFound", {
  path: Schema.String,
}) {}

export class BuildIdNotFound extends Schema.TaggedError<BuildIdNotFound>()("BuildIdNotFound", {
  path: Schema.String,
}) {}

export class KeyConflict extends Schema.TaggedError<KeyConflict>()("KeyConflict", {
  version: Schema.String,
  existing: Schema.Number,
  actual: Schema.Number,
}) {}
