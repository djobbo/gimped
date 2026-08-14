import { toIoError, type IoError } from "@gimped/common";
import { Context, Effect, FileSystem, Layer, Path } from "effect";
import { BuildIdNotFound, KeyNotFound } from "./errors.ts";

const INIT_RE = /ANE_RawData\.Init\((\d+)\)/g;
const VS_RE = /vs\s+"(\d+)"/;
const GAME_VERSION_RE = /gameVersion[\s\S]{0,80}"(\d+)"/;

export class KeyExtractor extends Context.Service<
  KeyExtractor,
  {
    readonly extract: (
      scriptsDir: string,
    ) => Effect.Effect<
      { readonly clientBuild: string; readonly swzKey: number },
      KeyNotFound | BuildIdNotFound | IoError
    >;
  }
>()("@gimped/patch/KeyExtractor") {
  static readonly layer: Layer.Layer<KeyExtractor, never, FileSystem.FileSystem | Path.Path> =
    Layer.effect(
      KeyExtractor,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        const extract = Effect.fn("KeyExtractor.extract")(function* (scriptsDir: string) {
          const names = yield* fs
            .readDirectory(scriptsDir, { recursive: true })
            .pipe(Effect.mapError((error) => toIoError(scriptsDir, error)));

          const asFiles = names.filter((name) => name.toLowerCase().endsWith(".as"));
          const texts = yield* Effect.forEach(
            asFiles,
            (relative) => {
              const filePath = path.join(scriptsDir, relative);
              return fs
                .readFileString(filePath)
                .pipe(Effect.mapError((error) => toIoError(filePath, error)));
            },
            { concurrency: "unbounded" },
          );

          const combined = texts.join("\n");

          const keys = new Set<number>();
          for (const match of combined.matchAll(INIT_RE)) {
            keys.add(Number(match[1]) >>> 0);
          }
          if (keys.size !== 1) {
            return yield* new KeyNotFound({ path: scriptsDir });
          }
          const swzKey = keys.values().next().value!;

          const vsMatch = combined.match(VS_RE);
          if (vsMatch?.[1] !== undefined) {
            return { clientBuild: vsMatch[1], swzKey };
          }

          const gameVersionMatch = combined.match(GAME_VERSION_RE);
          if (gameVersionMatch?.[1] !== undefined) {
            return { clientBuild: gameVersionMatch[1], swzKey };
          }

          return yield* new BuildIdNotFound({ path: scriptsDir });
        });

        return KeyExtractor.of({ extract });
      }),
    );
}
