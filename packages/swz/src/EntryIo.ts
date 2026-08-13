import { toIoError } from "@gimped/common";
import { Context, Effect, FileSystem, Layer, Path } from "effect";
import { IoError, MissingRegistry } from "./errors.ts";
import {
  makeRegistry,
  readRegistry,
  writeRegistry,
  type DirWriteOptions,
  type SwzDir,
} from "./registry.ts";
import type { SwzEntry } from "./SwzCodec.ts";

export type EntryFiletype = "xml" | "csv";

const WINDOWS_ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const XML_ROOT_OPEN = /^<\s*([A-Za-z_][\w.-]*)([^>]*)/;
const XML_ATTR = /([A-Za-z_][\w.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const xmlFileBaseName = (content: string): string => {
  const match = content.trimStart().match(XML_ROOT_OPEN);
  const root = match?.[1] ?? "entry";
  const rawAttrs = match?.[2] ?? "";
  const attrs: Array<{ readonly name: string; readonly value: string }> = [];

  for (const attr of rawAttrs.matchAll(XML_ATTR)) {
    const value = attr[2] ?? attr[3] ?? "";
    if (value.trim() !== "") {
      attrs.push({ name: attr[1]!, value });
    }
  }

  const findAttr = (predicate: (name: string) => boolean) =>
    attrs.find((attr) => predicate(attr.name.toLowerCase()))?.value;
  const disambiguator =
    findAttr((name) => name === "name") ??
    findAttr((name) => name === "title") ??
    findAttr((name) => name.endsWith("name"));

  return disambiguator === undefined ? root : `${root}_${disambiguator}`;
};

export const detectFiletype = (content: string): EntryFiletype =>
  content.trimStart().startsWith("<") ? "xml" : "csv";

export const entryFileName = (content: string): string => {
  const filetype = detectFiletype(content);
  const baseName =
    filetype === "xml"
      ? xmlFileBaseName(content)
      : (content.split("\n", 1)[0] ?? "").replaceAll("\r", "");

  return `${baseName.replace(WINDOWS_ILLEGAL_FILENAME_CHARS, "_")}.${filetype}`;
};

export class EntryIo extends Context.Service<
  EntryIo,
  {
    readonly detectFiletype: (content: string) => EntryFiletype;
    readonly entryFileName: (content: string) => string;
    readonly writeNativeDir: (
      entries: readonly SwzEntry[],
      outDir: string,
      options?: DirWriteOptions,
    ) => Effect.Effect<void, IoError>;
    readonly readNativeDir: (inDir: string) => Effect.Effect<SwzDir, IoError | MissingRegistry>;
  }
>()("@gimped/swz/EntryIo") {
  static readonly layer: Layer.Layer<EntryIo, never, FileSystem.FileSystem | Path.Path> =
    Layer.effect(
      EntryIo,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        const writeNativeDir = Effect.fn("EntryIo.writeNativeDir")(function* (
          entries: readonly SwzEntry[],
          outDir: string,
          options?: DirWriteOptions,
        ) {
          const fileNames = entries.map((entry) => entryFileName(entry.content));
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

          yield* Effect.forEach(
            entries,
            (entry, index) => {
              const filePath = path.join(outDir, fileNames[index]!);
              return fs
                .writeFileString(filePath, entry.content)
                .pipe(Effect.mapError((error) => toIoError(filePath, error)));
            },
            { concurrency: "unbounded" },
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

        const readNativeDir = Effect.fn("EntryIo.readNativeDir")(function* (inDir: string) {
          const registry = yield* readRegistry(inDir, { required: false });
          const fileNames =
            registry !== undefined
              ? Object.keys(registry.files)
              : yield* fs.readDirectory(inDir).pipe(
                  Effect.map((names) =>
                    names
                      .filter((fileName) => fileName.endsWith(".xml") || fileName.endsWith(".csv"))
                      .sort(),
                  ),
                  Effect.mapError((error) => toIoError(inDir, error)),
                );

          const entries = yield* Effect.forEach(
            fileNames,
            (fileName) => {
              const filePath = path.join(inDir, fileName);
              return fs.readFileString(filePath).pipe(
                Effect.map((content) => ({ content })),
                Effect.mapError((error) => toIoError(filePath, error)),
              );
            },
            { concurrency: "unbounded" },
          );

          return { seed: registry?.seed, entries } satisfies SwzDir;
        });

        return EntryIo.of({
          detectFiletype,
          entryFileName,
          writeNativeDir,
          readNativeDir,
        });
      }),
    );
}

export const writeNativeDir = Effect.fn("writeNativeDir")(function* (
  entries: readonly SwzEntry[],
  outDir: string,
  options?: DirWriteOptions,
) {
  const entryIo = yield* EntryIo;
  return yield* entryIo.writeNativeDir(entries, outDir, options);
});

export const readNativeDir = Effect.fn("readNativeDir")(function* (inDir: string) {
  const entryIo = yield* EntryIo;
  return yield* entryIo.readNativeDir(inDir);
});
