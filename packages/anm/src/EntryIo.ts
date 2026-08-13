import { IoError, MalformedJson, toIoError } from "@gimped/common";
import { Array as Arr, Context, Effect, FileSystem, Layer, Path } from "effect";
import { AnimDefJsonService, type AnimDef, type IndexFile } from "./AnimDefJson.ts";
import { InvalidAnm, MissingIndex } from "./errors.ts";

const WINDOWS_ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

const slugFile = (key: string): string =>
  `${key.replaceAll("/", "__").replace(WINDOWS_ILLEGAL_FILENAME_CHARS, "_")}.json`;

const uniqueNames = (keys: readonly string[]): readonly string[] => {
  const used = new Set<string>();
  return keys.map((key) => {
    const base = slugFile(key);
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
    const stem = base.slice(0, -".json".length);
    let n = 2;
    let candidate = `${stem}_${n}.json`;
    while (used.has(candidate)) {
      n += 1;
      candidate = `${stem}_${n}.json`;
    }
    used.add(candidate);
    return candidate;
  });
};

export class EntryIo extends Context.Service<
  EntryIo,
  {
    readonly writeDir: (defs: readonly AnimDef[], outDir: string) => Effect.Effect<void, IoError>;
    readonly readDir: (
      inDir: string,
    ) => Effect.Effect<readonly AnimDef[], IoError | MissingIndex | MalformedJson | InvalidAnm>;
  }
>()("@gimped/anm/EntryIo") {
  static readonly layer: Layer.Layer<
    EntryIo,
    never,
    AnimDefJsonService | FileSystem.FileSystem | Path.Path
  > = Layer.effect(
    EntryIo,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const json = yield* AnimDefJsonService;

      const writeDir = Effect.fn("EntryIo.writeDir")(function* (
        defs: readonly AnimDef[],
        outDir: string,
      ) {
        yield* fs
          .makeDirectory(outDir, { recursive: true })
          .pipe(Effect.mapError((error) => toIoError(outDir, error)));
        const files = uniqueNames(defs.map((def) => def.key));
        const index: IndexFile = {
          files: Arr.zipWith(files, defs, (file, def) => ({ file, key: def.key })),
        };
        const indexValue = yield* json.encodeIndex(index);
        yield* fs
          .writeFileString(
            path.join(outDir, "index.json"),
            `${JSON.stringify(indexValue, null, 2)}\n`,
          )
          .pipe(Effect.mapError((error) => toIoError(path.join(outDir, "index.json"), error)));
        const writeDef = Effect.fn("EntryIo.writeDef")(function* (def: AnimDef, i: number) {
          const fileName = files[i]!;
          const filePath = path.join(outDir, fileName);
          const value = yield* json.encodeDef(def);
          yield* fs
            .writeFileString(filePath, `${JSON.stringify(value, null, 2)}\n`)
            .pipe(Effect.mapError((error) => toIoError(filePath, error)));
        });
        yield* Effect.forEach(defs, writeDef);
      });

      const readDir = Effect.fn("EntryIo.readDir")(function* (inDir: string) {
        const indexPath = path.join(inDir, "index.json");
        const exists = yield* fs.exists(indexPath);
        if (!exists) return yield* new MissingIndex({ path: indexPath });
        const text = yield* fs
          .readFileString(indexPath)
          .pipe(Effect.mapError((error) => toIoError(indexPath, error)));
        const index = yield* json.decodeIndex(text, indexPath);
        const readDef = Effect.fn("EntryIo.readDef")(function* (entry: IndexFile["files"][number]) {
          const filePath = path.join(inDir, entry.file);
          const defText = yield* fs
            .readFileString(filePath)
            .pipe(Effect.mapError((error) => toIoError(filePath, error)));
          const def = yield* json.decodeDef(defText, filePath);
          if (def.key !== entry.key) {
            return yield* new InvalidAnm({ reason: "key mismatch" });
          }
          return def;
        });
        return yield* Effect.forEach(index.files, readDef);
      });

      return EntryIo.of({ writeDir, readDir });
    }),
  );
}
