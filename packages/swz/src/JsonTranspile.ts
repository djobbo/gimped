import { toIoError, toMalformedJson } from "@gimped/common";
import { Context, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { CsvCodec } from "./csvCodec.ts";
import { detectFiletype, entryFileName } from "./EntryIo.ts";
import { IoError, MalformedCsv, MalformedJson, MalformedXml, MissingRegistry } from "./errors.ts";
import {
  makeRegistry,
  readRegistry,
  writeRegistry,
  type DirWriteOptions,
  type SwzDir,
} from "./registry.ts";
import type { SwzEntry } from "./SwzCodec.ts";
import { XmlCodec } from "./xmlCodec.ts";

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

export const JsonEntry = Schema.Union([XmlJsonEntry, CsvJsonEntry]);
export type JsonEntry = typeof JsonEntry.Type;
export const JsonEntryText = Schema.fromJsonString(JsonEntry, { space: 2 });

const jsonFileName = (content: string, pathApi: Path.Path): string =>
  `${pathApi.parse(entryFileName(content)).name}.json`;

export class JsonTranspile extends Context.Service<
  JsonTranspile,
  {
    readonly writeJsonDir: (
      entries: readonly SwzEntry[],
      outDir: string,
      options?: DirWriteOptions,
    ) => Effect.Effect<void, IoError | MalformedCsv | MalformedXml>;
    readonly readJsonDir: (
      inDir: string,
    ) => Effect.Effect<
      SwzDir,
      IoError | MissingRegistry | MalformedJson | MalformedCsv | MalformedXml
    >;
  }
>()("@gimped/swz/JsonTranspile") {
  static readonly layer: Layer.Layer<
    JsonTranspile,
    never,
    FileSystem.FileSystem | Path.Path | XmlCodec | CsvCodec
  > = Layer.effect(
    JsonTranspile,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const xml = yield* XmlCodec;
      const csv = yield* CsvCodec;

      const writeJsonDir = Effect.fn("JsonTranspile.writeJsonDir")(function* (
        entries: readonly SwzEntry[],
        outDir: string,
        options?: DirWriteOptions,
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

        yield* Effect.forEach(entries, (entry, index) =>
          Effect.gen(function* () {
            const filetype = detectFiletype(entry.content);
            const fileName = fileNames[index]!;
            const filePath = path.join(outDir, fileName);
            const body: JsonEntry =
              filetype === "xml"
                ? { filetype, ...(yield* xml.xmlToJson(entry.content, filePath)) }
                : { filetype, ...(yield* csv.csvToJson(entry.content, filePath)) };
            const text = yield* Schema.encodeUnknownEffect(JsonEntryText)(body).pipe(Effect.orDie);

            yield* fs
              .writeFileString(filePath, `${text}\n`)
              .pipe(Effect.mapError((error) => toIoError(filePath, error)));
          }),
        );

        yield* writeRegistry(
          outDir,
          makeRegistry(
            fileNames.map((name, index) => ({
              name,
              filetype: detectFiletype(entries[index]!.content),
            })),
            options?.seed,
          ),
        );
      });

      const readJsonDir = Effect.fn("JsonTranspile.readJsonDir")(function* (inDir: string) {
        const registry = yield* readRegistry(inDir, { required: true });
        if (registry === undefined) {
          return yield* new MissingRegistry({ path: path.join(inDir, "registry.json") });
        }

        const entries = yield* Effect.forEach(Object.keys(registry.files), (fileName) =>
          Effect.gen(function* () {
            const filePath = path.join(inDir, fileName);
            const expectedFiletype = registry.files[fileName]!.filetype;
            const text = yield* fs
              .readFileString(filePath)
              .pipe(Effect.mapError((error) => toIoError(filePath, error)));

            const jsonEntry = yield* Schema.decodeUnknownEffect(JsonEntryText)(text).pipe(
              Effect.mapError((error) => toMalformedJson(filePath, error)),
            );

            if (jsonEntry.filetype !== expectedFiletype) {
              return yield* new IoError({
                path: filePath,
                message: `JSON filetype must match registry filetype ${expectedFiletype}`,
              });
            }

            const content =
              jsonEntry.filetype === "xml"
                ? yield* xml.jsonToXml({ root: jsonEntry.root }, filePath)
                : yield* csv.jsonToCsv(
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

        return { seed: registry.seed, entries } satisfies SwzDir;
      });

      return JsonTranspile.of({ writeJsonDir, readJsonDir });
    }),
  );
}

export const writeJsonDir = Effect.fn("writeJsonDir")(function* (
  entries: readonly SwzEntry[],
  outDir: string,
  options?: DirWriteOptions,
) {
  const json = yield* JsonTranspile;
  return yield* json.writeJsonDir(entries, outDir, options);
});

export const readJsonDir = Effect.fn("readJsonDir")(function* (inDir: string) {
  const json = yield* JsonTranspile;
  return yield* json.readJsonDir(inDir);
});
