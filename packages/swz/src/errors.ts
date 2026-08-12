import { Data } from "effect";

export class ChecksumMismatch extends Data.TaggedError("ChecksumMismatch")<{
  readonly where: "header" | "entry";
  readonly expected: number;
  readonly actual: number;
}> {}

export class InvalidSwz extends Data.TaggedError("InvalidSwz")<{
  readonly reason: string;
}> {}

export class UnknownVersion extends Data.TaggedError("UnknownVersion")<{
  readonly version: string;
}> {}

export class MissingRegistry extends Data.TaggedError("MissingRegistry")<{
  readonly path: string;
}> {}

export class IoError extends Data.TaggedError("IoError")<{
  readonly path: string;
  readonly message: string;
}> {}
