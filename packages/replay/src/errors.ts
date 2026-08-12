import { Schema } from "effect";

export class InvalidReplay extends Schema.TaggedError<InvalidReplay>()("InvalidReplay", {
  reason: Schema.String,
}) {}

export class ChecksumMismatch extends Schema.TaggedError<ChecksumMismatch>()("ChecksumMismatch", {
  expected: Schema.Number,
  actual: Schema.Number,
}) {}

export class GameDataError extends Schema.TaggedError<GameDataError>()("GameDataError", {
  path: Schema.String,
  message: Schema.String,
}) {}
