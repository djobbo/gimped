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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseJsonEntry = (value: unknown, expectedFiletype: "xml" | "csv"): JsonEntry => {
  if (!isRecord(value) || value.filetype !== expectedFiletype) {
    throw new Error(`JSON filetype must match registry filetype ${expectedFiletype}`);
  }

  if (expectedFiletype === "xml") {
    if (typeof value.xml !== "string") throw new Error("XML JSON entry must contain string xml");
    return { filetype: "xml", xml: value.xml };
  }

  if (typeof value.text !== "string") throw new Error("CSV JSON entry must contain string text");
  if (value.name !== undefined && typeof value.name !== "string") {
    throw new Error("CSV JSON entry name must be a string when present");
  }
  return {
    filetype: "csv",
    name: value.name ?? "",
    text: value.text,
  };
};

const tryIo = <A>(ioPath: string, operation: () => Promise<A>): Effect.Effect<A, IoError> =>
  Effect.tryPromise({
    try: operation,
    catch: (error) => new IoError({ path: ioPath, message: ioMessage(error) }),
  });

const jsonFileName = (content: string): string => `${path.parse(entryFileName(content)).name}.json`;

export const writeJsonDir = (
  entries: readonly SwzEntry[],
  outDir: string,
): Effect.Effect<void, IoError> => {
  const fileNames = entries.map((entry) => jsonFileName(entry.content));
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
    const registry: Registry = { files: {} };

    for (const [index, entry] of entries.entries()) {
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
};

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
          const registryEntry = registry.files[fileName];
          if (registryEntry?.filetype !== "xml" && registryEntry?.filetype !== "csv") {
            throw new Error("Registry entry must specify filetype xml or csv");
          }
          const jsonEntry = parseJsonEntry(
            JSON.parse(await fs.readFile(filePath, "utf8")) as unknown,
            registryEntry.filetype,
          );
          return {
            content: jsonEntry.filetype === "xml" ? jsonEntry.xml : jsonEntry.text,
          };
        });
      },
      { concurrency: "unbounded" },
    );
  });
