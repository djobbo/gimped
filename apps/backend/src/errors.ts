import { Schema } from "effect";

export class UdpBindError extends Schema.TaggedError<UdpBindError>()("UdpBindError", {
  host: Schema.String,
  message: Schema.String,
}) {}

export class MatchSpecParseError extends Schema.TaggedError<MatchSpecParseError>()(
  "MatchSpecParseError",
  {
    reason: Schema.String,
  },
) {}
