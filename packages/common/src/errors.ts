import { Schema } from "effect";

export class IoError extends Schema.TaggedError<IoError>()("IoError", {
  path: Schema.String,
  message: Schema.String,
}) {}

export class MalformedJson extends Schema.TaggedError<MalformedJson>()("MalformedJson", {
  path: Schema.String,
  message: Schema.String,
}) {}

export const toIoError = (path: string, error: unknown): IoError =>
  new IoError({
    path,
    message: error instanceof Error ? error.message : String(error),
  });

export const toMalformedJson = (path: string, error: unknown): MalformedJson =>
  new MalformedJson({
    path,
    message: error instanceof Error ? error.message : String(error),
  });
