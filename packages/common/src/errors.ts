import { Schema } from "effect";

export class IoError extends Schema.TaggedError<IoError>()("IoError", {
  path: Schema.String,
  message: Schema.String,
}) {}

export class MalformedJson extends Schema.TaggedError<MalformedJson>()("MalformedJson", {
  path: Schema.String,
  message: Schema.String,
}) {}

export const toIoError = (path: string, cause: unknown): IoError =>
  new IoError({
    path,
    message: cause instanceof Error ? cause.message : String(cause),
  });

export const toMalformedJson = (path: string, cause: unknown): MalformedJson =>
  new MalformedJson({
    path,
    message: cause instanceof Error ? cause.message : String(cause),
  });
