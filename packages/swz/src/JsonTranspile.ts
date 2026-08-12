import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Effect } from "effect";
import { detectFiletype, entryFileName } from "./Entry.ts";
import { IoError, MissingRegistry } from "./errors.ts";
import type { SwzEntry } from "./SwzCodec.ts";

export type Registry = {
  files: Record<string, { filetype: "xml" | "csv" }>;
};

type JsonEntry = { filetype: "xml"; xml: string } | { filetype: "csv"; name: string; text: string };

const ioMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const tryIo = <A>(ioPath: string, operation: () => Promise<A>): Effect.Effect<A, IoError> =>
  Effect.tryPromise({
    try: operation,
    catch: (error) => new IoError({ path: ioPath, message: ioMessage(error) }),
  });

const jsonFileName = (content: string): string => `${path.parse(entryFileName(content)).name}.json`;

export const writeJsonDir = (
  entries: readonly SwzEntry[],
  outDir: string,
): Effect.Effect<void, IoError> =>
  tryIo(outDir, async () => {
    await fs.mkdir(outDir, { recursive: true });
    const registry: Registry = { files: {} };

    for (const entry of entries) {
      const filetype = detectFiletype(entry.content);
      const fileName = jsonFileName(entry.content);
      const jsonEntry: JsonEntry =
        filetype === "xml"
          ? { filetype, xml: entry.content }
          : {
              filetype,
              name: entry.content.split("\n", 1)[0]?.replaceAll("\r", "") ?? "",
              text: entry.content,
            };

      await fs.writeFile(
        path.join(outDir, fileName),
        `${JSON.stringify(jsonEntry, null, 2)}\n`,
        "utf8",
      );
      registry.files[fileName] = { filetype };
    }

    await fs.writeFile(
      path.join(outDir, "registry.json"),
      `${JSON.stringify(registry, null, 2)}\n`,
      "utf8",
    );
  });

const readRegistry = (registryPath: string): Effect.Effect<Registry, IoError | MissingRegistry> =>
  Effect.tryPromise({
    try: async () => JSON.parse(await fs.readFile(registryPath, "utf8")) as Registry,
    catch: (error) =>
      typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
        ? new MissingRegistry({ path: registryPath })
        : new IoError({ path: registryPath, message: ioMessage(error) }),
  });

export const readJsonDir = (inDir: string): Effect.Effect<SwzEntry[], IoError | MissingRegistry> =>
  Effect.gen(function* () {
    const registry = yield* readRegistry(path.join(inDir, "registry.json"));
    const fileNames = Object.keys(registry.files).sort();

    return yield* Effect.forEach(
      fileNames,
      (fileName) => {
        const filePath = path.join(inDir, fileName);
        return tryIo(filePath, async () => {
          const jsonEntry = JSON.parse(await fs.readFile(filePath, "utf8")) as JsonEntry;
          return {
            content: jsonEntry.filetype === "xml" ? jsonEntry.xml : jsonEntry.text,
          };
        });
      },
      { concurrency: "unbounded" },
    );
  });
