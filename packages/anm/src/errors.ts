import { Schema } from "effect";

export class InvalidAnm extends Schema.TaggedError<InvalidAnm>()("InvalidAnm", {
  reason: Schema.String,
}) {}

export class MissingIndex extends Schema.TaggedError<MissingIndex>()("MissingIndex", {
  path: Schema.String,
}) {}

export class GameDataError extends Schema.TaggedError<GameDataError>()("GameDataError", {
  path: Schema.String,
  message: Schema.String,
}) {}
