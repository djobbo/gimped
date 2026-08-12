import { Schema } from "effect";

export { IoError, MalformedJson } from "@gimped/common";

export class ChecksumMismatch extends Schema.TaggedError<ChecksumMismatch>()("ChecksumMismatch", {
  where: Schema.Literals(["header", "entry"]),
  expected: Schema.Number,
  actual: Schema.Number,
}) {}

export class InvalidSwz extends Schema.TaggedError<InvalidSwz>()("InvalidSwz", {
  reason: Schema.String,
}) {}

export class UnknownVersion extends Schema.TaggedError<UnknownVersion>()("UnknownVersion", {
  version: Schema.String,
}) {}

export class MissingRegistry extends Schema.TaggedError<MissingRegistry>()("MissingRegistry", {
  path: Schema.String,
}) {}

export class MalformedCsv extends Schema.TaggedError<MalformedCsv>()("MalformedCsv", {
  path: Schema.String,
  message: Schema.String,
}) {}

export class MalformedXml extends Schema.TaggedError<MalformedXml>()("MalformedXml", {
  path: Schema.String,
  message: Schema.String,
}) {}
