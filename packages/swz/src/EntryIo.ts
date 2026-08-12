import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Effect } from "effect";
import { entryFileName } from "./Entry.ts";
import { IoError } from "./errors.ts";
import type { SwzEntry } from "./SwzCodec.ts";

export { detectFiletype, entryFileName } from "./Entry.ts";

const tryIo = <A>(ioPath: string, operation: () => Promise<A>): Effect.Effect<A, IoError> =>
  Effect.tryPromise({
    try: operation,
    catch: (error) =>
      new IoError({
        path: ioPath,
        message: error instanceof Error ? error.message : String(error),
      }),
  });

export const writeNativeDir = (
  entries: readonly SwzEntry[],
  outDir: string,
): Effect.Effect<void, IoError> =>
  tryIo(outDir, async () => {
    await fs.mkdir(outDir, { recursive: true });
    await Promise.all(
      entries.map((entry) =>
        fs.writeFile(path.join(outDir, entryFileName(entry.content)), entry.content, "utf8"),
      ),
    );
  });

export const readNativeDir = (inDir: string): Effect.Effect<SwzEntry[], IoError> =>
  tryIo(inDir, async () => {
    const fileNames = (await fs.readdir(inDir))
      .filter((fileName) => fileName.endsWith(".xml") || fileName.endsWith(".csv"))
      .sort();
    const contents = await Promise.all(
      fileNames.map((fileName) => fs.readFile(path.join(inDir, fileName), "utf8")),
    );
    return contents.map((content) => ({ content }));
  });
