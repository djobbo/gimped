import { toIoError, toMalformedJson } from "@gimped/common";
import { Context, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { csvToJson, jsonToCsv } from "./csvCodec.ts";
import { detectFiletype, entryFileName } from "./EntryIo.ts";
import { IoError, MalformedCsv, MalformedJson, MalformedXml, MissingRegistry } from "./errors.ts";
import type { SwzEntry } from "./SwzCodec.ts";
import { jsonToXml, xmlToJson } from "./xmlCodec.ts";

export const RegistryEntry = Schema.Struct({
  filetype: Schema.Literals(["xml", "csv"]),
});

export const Registry = Schema.Struct({
  files: Schema.Record(Schema.String, RegistryEntry),
});
export type Registry = typeof Registry.Type;

const XmlJsonEntry = Schema.Struct({
  filetype: Schema.Literal("xml"),
  root: Schema.Record(Schema.String, Schema.Unknown),
});

const CsvJsonEntry = Schema.Struct({
  filetype: Schema.Literal("csv"),
  name: Schema.String,
  headers: Schema.Array(Schema.String),
  rows: Schema.Array(Schema.Record(Schema.String, Schema.String)),
});

const JsonEntry = Schema.Union([XmlJsonEntry, CsvJsonEntry]);
type JsonEntry = typeof JsonEntry.Type;

const jsonFileName = (content: string, pathApi: Path.Path): string =>
  `${pathApi.parse(entryFileName(content)).name}.json`;

export class JsonTranspile extends Context.Service<
  JsonTranspile,
  {
    readonly writeJsonDir: (
      entries: readonly SwzEntry[],
      outDir: string,
    ) => Effect.Effect<void, IoError | MalformedCsv | MalformedXml>;
    readonly readJsonDir: (
      inDir: string,
    ) => Effect.Effect<
      SwzEntry[],
      IoError | MissingRegistry | MalformedJson | MalformedCsv | MalformedXml
    >;
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
              const filePath = path.join(outDir, fileName);
              const body =
                filetype === "xml"
                  ? { filetype, ...(yield* xmlToJson(entry.content, filePath)) }
                  : { filetype, ...(yield* csvToJson(entry.content, filePath)) };

              yield* fs
                .writeFileString(filePath, `${JSON.stringify(body, null, 2)}\n`)
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
              ).pipe(Effect.mapError((error) => toMalformedJson(filePath, error)));

              if (jsonEntry.filetype !== expectedFiletype) {
                return yield* new IoError({
                  path: filePath,
                  message: `JSON filetype must match registry filetype ${expectedFiletype}`,
                });
              }

              const content =
                jsonEntry.filetype === "xml"
                  ? yield* jsonToXml({ root: jsonEntry.root }, filePath)
                  : yield* jsonToCsv(
                      {
                        name: jsonEntry.name,
                        headers: jsonEntry.headers,
                        rows: jsonEntry.rows,
                      },
                      filePath,
                    );

              return {
                content,
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
