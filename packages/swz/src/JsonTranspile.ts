import { Context, Effect, FileSystem, Layer, Path, Schema } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { detectFiletype, entryFileName } from "./EntryIo.ts";
import { IoError, MissingRegistry } from "./errors.ts";
import type { SwzEntry } from "./SwzCodec.ts";

export const RegistryEntry = Schema.Struct({
  filetype: Schema.Literals(["xml", "csv"]),
});

export const Registry = Schema.Struct({
  files: Schema.Record(Schema.String, RegistryEntry),
});
export type Registry = typeof Registry.Type;

const XmlJsonEntry = Schema.Struct({
  filetype: Schema.Literal("xml"),
  xml: Schema.String,
});

const CsvJsonEntry = Schema.Struct({
  filetype: Schema.Literal("csv"),
  name: Schema.optionalKey(Schema.String),
  text: Schema.String,
});

const JsonEntry = Schema.Union([XmlJsonEntry, CsvJsonEntry]);
type JsonEntry = typeof JsonEntry.Type;

const toIoError = (path: string, error: PlatformError | unknown): IoError =>
  new IoError({
    path,
    message: error instanceof Error ? error.message : String(error),
  });

const jsonFileName = (content: string, pathApi: Path.Path): string =>
  `${pathApi.parse(entryFileName(content)).name}.json`;

export class JsonTranspile extends Context.Service<
  JsonTranspile,
  {
    readonly writeJsonDir: (
      entries: readonly SwzEntry[],
      outDir: string,
    ) => Effect.Effect<void, IoError>;
    readonly readJsonDir: (inDir: string) => Effect.Effect<SwzEntry[], IoError | MissingRegistry>;
  }
>()("@gimped/swz/JsonTranspile") {
  static readonly layer: Layer.Layer<JsonTranspile, never, FileSystem.FileSystem | Path.Path> =
    Layer.effect(
      JsonTranspile,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        const writeJsonDir = Effect.fn("JsonTranspile.writeJsonDir")(function* (
          entries: readonly SwzEntry[],
          outDir: string,
        ) {
          const fileNames = entries.map((entry) => jsonFileName(entry.content, path));
          const seen = new Set<string>();
          const collision = fileNames.find((fileName) => {
            if (seen.has(fileName)) return true;
            seen.add(fileName);
            return false;
          });

          if (collision !== undefined) {
            return yield* new IoError({
              path: path.join(outDir, collision),
              message: `Multiple entries resolve to ${collision}`,
            });
          }

          yield* fs
            .makeDirectory(outDir, { recursive: true })
            .pipe(Effect.mapError((error) => toIoError(outDir, error)));

          const registryFiles: Record<string, { filetype: "xml" | "csv" }> = {};

          yield* Effect.forEach(entries, (entry, index) =>
            Effect.gen(function* () {
              const filetype = detectFiletype(entry.content);
              const fileName = fileNames[index]!;
              const jsonEntry: JsonEntry =
                filetype === "xml"
                  ? { filetype, xml: entry.content }
                  : {
                      filetype,
                      name: entry.content.split("\n", 1)[0]?.replaceAll("\r", "") ?? "",
                      text: entry.content,
                    };

              const filePath = path.join(outDir, fileName);
              yield* fs
                .writeFileString(filePath, `${JSON.stringify(jsonEntry, null, 2)}\n`)
                .pipe(Effect.mapError((error) => toIoError(filePath, error)));
              registryFiles[fileName] = { filetype };
            }),
          );

          const registry: Registry = { files: registryFiles };
          const registryPath = path.join(outDir, "registry.json");
          yield* fs
            .writeFileString(registryPath, `${JSON.stringify(registry, null, 2)}\n`)
            .pipe(Effect.mapError((error) => toIoError(registryPath, error)));
        });

        const readJsonDir = Effect.fn("JsonTranspile.readJsonDir")(function* (inDir: string) {
          const registryPath = path.join(inDir, "registry.json");
          const registryText = yield* fs
            .readFileString(registryPath)
            .pipe(
              Effect.mapError((error) =>
                error._tag === "PlatformError" && error.reason._tag === "NotFound"
                  ? new MissingRegistry({ path: registryPath })
                  : toIoError(registryPath, error),
              ),
            );

          const registry = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Registry))(
            registryText,
          ).pipe(Effect.mapError((error) => toIoError(registryPath, error)));

          const fileNames = Object.keys(registry.files).sort();

          return yield* Effect.forEach(fileNames, (fileName) =>
            Effect.gen(function* () {
              const filePath = path.join(inDir, fileName);
              const expectedFiletype = registry.files[fileName]!.filetype;
              const text = yield* fs
                .readFileString(filePath)
                .pipe(Effect.mapError((error) => toIoError(filePath, error)));

              const jsonEntry = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(JsonEntry))(
                text,
              ).pipe(Effect.mapError((error) => toIoError(filePath, error)));

              if (jsonEntry.filetype !== expectedFiletype) {
                return yield* new IoError({
                  path: filePath,
                  message: `JSON filetype must match registry filetype ${expectedFiletype}`,
                });
              }

              return {
                content: jsonEntry.filetype === "xml" ? jsonEntry.xml : jsonEntry.text,
              } satisfies SwzEntry;
            }),
          );
        });

        return JsonTranspile.of({ writeJsonDir, readJsonDir });
      }),
    );
}

export const writeJsonDir = Effect.fn("writeJsonDir")(function* (
  entries: readonly SwzEntry[],
  outDir: string,
) {
  const json = yield* JsonTranspile;
  return yield* json.writeJsonDir(entries, outDir);
});

export const readJsonDir = Effect.fn("readJsonDir")(function* (inDir: string) {
  const json = yield* JsonTranspile;
  return yield* json.readJsonDir(inDir);
});
