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
): Effect.Effect<void, IoError> => {
  const fileNames = entries.map((entry) => entryFileName(entry.content));
  const seen = new Set<string>();
  const collision = fileNames.find((fileName) => {
    if (seen.has(fileName)) return true;
    seen.add(fileName);
    return false;
  });

  if (collision !== undefined) {
    const collisionPath = path.join(outDir, collision);
    return Effect.fail(
      new IoError({
        path: collisionPath,
        message: `Multiple entries resolve to ${collision}`,
      }),
    );
  }

  return tryIo(outDir, async () => {
    await fs.mkdir(outDir, { recursive: true });
    await Promise.all(
      entries.map((entry, index) =>
        fs.writeFile(path.join(outDir, fileNames[index]!), entry.content, "utf8"),
      ),
    );
  });
};

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
