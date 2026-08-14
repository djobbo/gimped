import { toIoError, type IoError } from "@gimped/common";
import { Context, Effect, FileSystem, Layer, Path, Stdio, Stream } from "effect";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { CachePaths } from "./CachePaths.ts";
import { FILELIST_BODY, STEAM_APP_ID, STEAM_DEPOT_ID, STEAM_OS } from "./constants.ts";
import { DepotDownloadFailed, MissingSteamCredentials, ToolDownloadFailed } from "./errors.ts";
import { SteamCredentials } from "./SteamCredentials.ts";
import { ToolCache } from "./ToolCache.ts";

type MessageError = { readonly message: string };

const concatChunks = (chunks: ReadonlyArray<Uint8Array>): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

const toDepotDownloadFailed = (error: MessageError): DepotDownloadFailed =>
  new DepotDownloadFailed({ message: error.message });

const steamArgs = (
  username: string,
  password: string,
  extra: ReadonlyArray<string>,
): Array<string> => [
  "-username",
  username,
  "-password",
  password,
  "-remember-password",
  "-app",
  String(STEAM_APP_ID),
  "-depot",
  String(STEAM_DEPOT_ID),
  "-os",
  STEAM_OS,
  ...extra,
];

export class DepotClient extends Context.Service<
  DepotClient,
  {
    readonly parseManifestId: (output: string) => Effect.Effect<string, DepotDownloadFailed>;
    readonly resolvePublicManifest: (
      root: string,
    ) => Effect.Effect<
      string,
      MissingSteamCredentials | DepotDownloadFailed | ToolDownloadFailed | IoError
    >;
    readonly download: (
      root: string,
      manifestId: string,
      full: boolean,
    ) => Effect.Effect<
      void,
      MissingSteamCredentials | DepotDownloadFailed | ToolDownloadFailed | IoError
    >;
  }
>()("@gimped/patch/DepotClient") {
  static readonly layer: Layer.Layer<
    DepotClient,
    never,
    | ToolCache
    | CachePaths
    | FileSystem.FileSystem
    | Path.Path
    | ChildProcessSpawner
    | Stdio.Stdio
    | SteamCredentials
  > = Layer.effect(
    DepotClient,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const paths = yield* CachePaths;
      const tools = yield* ToolCache;
      const spawner = yield* ChildProcessSpawner;
      const stdio = yield* Stdio.Stdio;
      const steam = yield* SteamCredentials;

      const parseManifestId = Effect.fn("DepotClient.parseManifestId")(function* (output: string) {
        const manifest = output.match(/Manifest (\d+) \(/);
        if (manifest?.[1] !== undefined) {
          return manifest[1];
        }
        const already = output.match(/Already have manifest (\d+) for depot/);
        if (already?.[1] !== undefined) {
          return already[1];
        }
        return yield* new DepotDownloadFailed({
          message: `Could not parse manifest id from DepotDownloader output: ${output.slice(0, 500)}`,
        });
      });

      const credentials = Effect.fn("DepotClient.credentials")(function* () {
        return yield* steam.get;
      });

      const runPiped = (bin: string, args: ReadonlyArray<string>) =>
        Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* ChildProcess.make(bin, args, {
              stdin: "inherit",
              stdout: "pipe",
              stderr: "pipe",
            });
            const chunks: Array<Uint8Array> = [];
            const capture = (chunk: Uint8Array) =>
              Effect.sync(() => {
                chunks.push(chunk);
              });
            yield* Effect.all(
              [
                handle.stdout.pipe(
                  Stream.tap(capture),
                  Stream.run(stdio.stdout({ endOnDone: false })),
                ),
                handle.stderr.pipe(
                  Stream.tap(capture),
                  Stream.run(stdio.stderr({ endOnDone: false })),
                ),
              ],
              { concurrency: 2 },
            );
            const code = yield* handle.exitCode;
            return { code, chunks };
          }).pipe(Effect.provideService(ChildProcessSpawner, spawner)),
        ).pipe(Effect.mapError(toDepotDownloadFailed));

      const runInherited = (bin: string, args: ReadonlyArray<string>) =>
        Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* ChildProcess.make(bin, args, {
              stdin: "inherit",
              stdout: "inherit",
              stderr: "inherit",
            });
            return yield* handle.exitCode;
          }).pipe(Effect.provideService(ChildProcessSpawner, spawner)),
        ).pipe(Effect.mapError(toDepotDownloadFailed));

      const resolvePublicManifest = Effect.fn("DepotClient.resolvePublicManifest")(function* (
        root: string,
      ) {
        const { username, password } = yield* credentials();
        const bin = yield* tools.ensureDepotDownloader(root);
        const resolveDir = path.join(root, "resolve");
        yield* fs
          .makeDirectory(resolveDir, { recursive: true })
          .pipe(Effect.mapError((error) => toIoError(resolveDir, error)));

        const result = yield* runPiped(
          bin,
          steamArgs(username, password, ["-manifest-only", "-dir", resolveDir]),
        );
        const text = new TextDecoder().decode(concatChunks(result.chunks));
        if (Number(result.code) !== 0) {
          return yield* new DepotDownloadFailed({
            message: `DepotDownloader exited ${String(result.code)}: ${text.slice(0, 500)}`,
          });
        }
        return yield* parseManifestId(text);
      });

      const download = Effect.fn("DepotClient.download")(function* (
        root: string,
        manifestId: string,
        full: boolean,
      ) {
        const { username, password } = yield* credentials();
        const bin = yield* tools.ensureDepotDownloader(root);
        const depotDir = paths.depotDir(root, manifestId);
        yield* fs
          .makeDirectory(depotDir, { recursive: true })
          .pipe(Effect.mapError((error) => toIoError(depotDir, error)));

        const extra: Array<string> = ["-manifest", manifestId, "-dir", depotDir];
        if (!full) {
          const filelistPath = path.join(paths.patchDir(root, manifestId), "filelist.txt");
          yield* fs
            .writeFileString(filelistPath, FILELIST_BODY)
            .pipe(Effect.mapError((error) => toIoError(filelistPath, error)));
          extra.push("-filelist", filelistPath);
        }

        const code = yield* runInherited(bin, steamArgs(username, password, extra));
        if (Number(code) !== 0) {
          return yield* new DepotDownloadFailed({
            message: `DepotDownloader exited ${String(code)}`,
          });
        }
      });

      return { parseManifestId, resolvePublicManifest, download };
    }),
  );
}
