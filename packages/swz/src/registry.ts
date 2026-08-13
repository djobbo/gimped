import { toIoError } from "@gimped/common";
import { Effect, FileSystem, Path, Schema } from "effect";
import { MissingRegistry } from "./errors.ts";
import type { SwzEntry } from "./SwzCodec.ts";

export const REGISTRY_FILENAME = "registry.json";

export const RegistryEntry = Schema.Struct({
  filetype: Schema.Literals(["xml", "csv"]),
});

export const Registry = Schema.Struct({
  seed: Schema.optionalKey(Schema.Number),
  files: Schema.Record(Schema.String, RegistryEntry),
});
export const RegistryText = Schema.fromJsonString(Registry, { space: 2 });
export type Registry = typeof Registry.Type;

export type DirWriteOptions = {
  readonly seed?: number;
};

export type SwzDir = {
  readonly seed?: number;
  readonly entries: readonly SwzEntry[];
};

export const makeRegistry = (
  files: ReadonlyArray<{ readonly name: string; readonly filetype: "xml" | "csv" }>,
  seed?: number,
): Registry => {
  const record: Record<string, { filetype: "xml" | "csv" }> = {};
  for (const file of files) {
    record[file.name] = { filetype: file.filetype };
  }
  return seed === undefined ? { files: record } : { seed: seed >>> 0, files: record };
};

export const writeRegistry = Effect.fn("writeRegistry")(function* (
  dir: string,
  registry: Registry,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const filePath = path.join(dir, REGISTRY_FILENAME);
  const text = yield* Schema.encodeUnknownEffect(RegistryText)(registry).pipe(Effect.orDie);
  yield* fs
    .writeFileString(filePath, `${text}\n`)
    .pipe(Effect.mapError((error) => toIoError(filePath, error)));
});

export const readRegistry = Effect.fn("readRegistry")(function* (
  dir: string,
  options: { readonly required: boolean },
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const filePath = path.join(dir, REGISTRY_FILENAME);
  const result = yield* Effect.result(fs.readFileString(filePath));
  if (result._tag === "Failure") {
    const error = result.failure;
    const notFound = error._tag === "PlatformError" && error.reason._tag === "NotFound";
    if (notFound && !options.required) {
      return undefined;
    }
    if (notFound && options.required) {
      return yield* new MissingRegistry({ path: filePath });
    }
    return yield* Effect.fail(toIoError(filePath, error));
  }

  return yield* Schema.decodeUnknownEffect(RegistryText)(result.success).pipe(
    Effect.mapError((error) => toIoError(filePath, error)),
  );
});
