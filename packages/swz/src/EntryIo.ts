import { Context, Effect, FileSystem, Layer, Path } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { IoError } from "./errors.ts";
import type { SwzEntry } from "./SwzCodec.ts";

export type EntryFiletype = "xml" | "csv";

const WINDOWS_ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const XML_ROOT_TAG = /^<\s*([A-Za-z_][\w.-]*)/;

const toIoError = (path: string, error: PlatformError | unknown): IoError =>
  new IoError({
    path,
    message: error instanceof Error ? error.message : String(error),
  });

export const detectFiletype = (content: string): EntryFiletype =>
  content.trimStart().startsWith("<") ? "xml" : "csv";

export const entryFileName = (content: string): string => {
  const filetype = detectFiletype(content);
  const baseName =
    filetype === "xml"
      ? (content.trimStart().match(XML_ROOT_TAG)?.[1] ?? "entry")
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
    ) => Effect.Effect<void, IoError>;
    readonly readNativeDir: (inDir: string) => Effect.Effect<SwzEntry[], IoError>;
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
        });

        const readNativeDir = Effect.fn("EntryIo.readNativeDir")(function* (inDir: string) {
          const fileNames = yield* fs.readDirectory(inDir).pipe(
            Effect.map((names) =>
              names
                .filter((fileName) => fileName.endsWith(".xml") || fileName.endsWith(".csv"))
                .sort(),
            ),
            Effect.mapError((error) => toIoError(inDir, error)),
          );

          return yield* Effect.forEach(
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
) {
  const entryIo = yield* EntryIo;
  return yield* entryIo.writeNativeDir(entries, outDir);
});

export const readNativeDir = Effect.fn("readNativeDir")(function* (inDir: string) {
  const entryIo = yield* EntryIo;
  return yield* entryIo.readNativeDir(inDir);
});
