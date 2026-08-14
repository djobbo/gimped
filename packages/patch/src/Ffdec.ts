import { toIoError, type IoError } from "@gimped/common";
import { Config, Context, Effect, FileSystem, Layer, Path } from "effect";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { FFDEC_DEFAULT_MEMORY } from "./constants.ts";
import { FfdecFailed, MissingJava, MissingSwf, ToolDownloadFailed } from "./errors.ts";
import { ToolCache, type JpexsLaunch } from "./ToolCache.ts";

export type FfdecCommand = {
  readonly bin: string;
  readonly args: ReadonlyArray<string>;
};

export const ffdecSpawn = (
  launch: JpexsLaunch,
  scriptsDir: string,
  swfPath: string,
  memory: string,
): FfdecCommand => {
  const exportArgs = ["-export", "script", scriptsDir, swfPath] as const;
  if (launch.kind === "jar") {
    return {
      bin: "java",
      args: [`-Xmx${memory}`, "-jar", launch.path, ...exportArgs],
    };
  }
  return { bin: launch.path, args: exportArgs };
};

type MessageError = { readonly message: string };

const toFfdecFailed = (error: MessageError): FfdecFailed =>
  new FfdecFailed({ message: error.message });

const toMissingJava = (error: MessageError): MissingJava =>
  new MissingJava({ message: error.message });

export class Ffdec extends Context.Service<
  Ffdec,
  {
    readonly findSwf: (depotDir: string) => Effect.Effect<string, MissingSwf | IoError>;
    readonly exportScripts: (
      root: string,
      depotDir: string,
      scriptsDir: string,
    ) => Effect.Effect<
      string,
      MissingJava | FfdecFailed | MissingSwf | ToolDownloadFailed | IoError
    >;
  }
>()("@gimped/patch/Ffdec") {
  static readonly layer: Layer.Layer<
    Ffdec,
    never,
    ToolCache | FileSystem.FileSystem | Path.Path | ChildProcessSpawner
  > = Layer.effect(
    Ffdec,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const tools = yield* ToolCache;
      const spawner = yield* ChildProcessSpawner;

      const findSwf = Effect.fn("Ffdec.findSwf")(function* (depotDir: string) {
        const entries = yield* fs
          .readDirectory(depotDir)
          .pipe(Effect.mapError((error) => toIoError(depotDir, error)));
        const swfs = entries.filter((entry) => entry.toLowerCase().endsWith(".swf"));
        const air = swfs.find((entry) => entry.toLowerCase() === "brawlhallaair.swf");
        if (air !== undefined) {
          return path.join(depotDir, air);
        }
        if (swfs.length === 1) {
          return path.join(depotDir, swfs[0]!);
        }
        return yield* new MissingSwf({ path: depotDir });
      });

      const runInherited = (
        bin: string,
        args: ReadonlyArray<string>,
        mapError: (error: MessageError) => MissingJava | FfdecFailed,
      ) =>
        Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* ChildProcess.make(bin, args, {
              stdin: "inherit",
              stdout: "inherit",
              stderr: "inherit",
            });
            return yield* handle.exitCode;
          }).pipe(Effect.provideService(ChildProcessSpawner, spawner)),
        ).pipe(Effect.mapError(mapError));

      const ensureJava = Effect.fn("Ffdec.ensureJava")(function* () {
        const code = yield* runInherited("java", ["-version"], toMissingJava);
        if (Number(code) !== 0) {
          return yield* new MissingJava({
            message: `java -version exited ${String(code)}`,
          });
        }
      });

      const exportScripts = Effect.fn("Ffdec.exportScripts")(function* (
        root: string,
        depotDir: string,
        scriptsDir: string,
      ) {
        yield* fs
          .makeDirectory(scriptsDir, { recursive: true })
          .pipe(Effect.mapError((error) => toIoError(scriptsDir, error)));

        const launch = yield* tools.ensureJpexs(root);
        const swfPath = yield* findSwf(depotDir);

        if (launch.kind === "jar") {
          yield* ensureJava();
        }

        const memory = yield* Config.string("FFDEC_MEMORY").pipe(
          Config.withDefault(FFDEC_DEFAULT_MEMORY),
        );
        const { bin, args } = ffdecSpawn(launch, scriptsDir, swfPath, memory);

        const code = yield* runInherited(bin, args, toFfdecFailed);
        if (Number(code) !== 0) {
          return yield* new FfdecFailed({
            message: `FFDec exited ${String(code)}`,
          });
        }

        return path.basename(swfPath);
      });

      return { findSwf, exportScripts };
    }),
  );
}
