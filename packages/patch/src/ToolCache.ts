import { toIoError, type IoError } from "@gimped/common";
import { Context, Effect, FileSystem, Layer, Path, PlatformError } from "effect";
import { CachePaths } from "./CachePaths.ts";
import { DEPOT_REPO, JPEXS_REPO } from "./constants.ts";
import { ToolDownloadFailed } from "./errors.ts";
import { GithubRelease } from "./GithubRelease.ts";
import { ToolPlatform } from "./ToolPlatform.ts";

export type JpexsLaunch =
  | { readonly kind: "cli"; readonly path: string }
  | { readonly kind: "script"; readonly path: string }
  | { readonly kind: "jar"; readonly path: string };

const isNotFound = (error: PlatformError.PlatformError): boolean =>
  error.reason._tag === "NotFound";

const depotBinaryName = (os: ToolPlatform["Service"]["os"]): string =>
  os === "win32" ? "DepotDownloader.exe" : "DepotDownloader";

const depotZipName = (
  os: ToolPlatform["Service"]["os"],
  arch: ToolPlatform["Service"]["arch"],
): string | undefined => {
  if (os === "win32" && arch === "x64") {
    return "DepotDownloader-windows-x64.zip";
  }
  if (os === "linux" && arch === "x64") {
    return "DepotDownloader-linux-x64.zip";
  }
  if (os === "darwin" && arch === "arm64") {
    return "DepotDownloader-macos-arm64.zip";
  }
  if (os === "darwin" && arch === "x64") {
    return "DepotDownloader-macos-x64.zip";
  }
  return undefined;
};

const jpexsZipPick = (name: string): boolean => /^ffdec_\d+\.\d+\.\d+\.zip$/.test(name);

export class ToolCache extends Context.Service<
  ToolCache,
  {
    readonly ensureDepotDownloader: (
      root: string,
    ) => Effect.Effect<string, ToolDownloadFailed | IoError>;
    readonly ensureJpexs: (
      root: string,
    ) => Effect.Effect<JpexsLaunch, ToolDownloadFailed | IoError>;
  }
>()("@gimped/patch/ToolCache") {
  static readonly layer: Layer.Layer<
    ToolCache,
    never,
    CachePaths | GithubRelease | ToolPlatform | FileSystem.FileSystem | Path.Path
  > = Layer.effect(
    ToolCache,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const paths = yield* CachePaths;
      const github = yield* GithubRelease;
      const platform = yield* ToolPlatform;

      const findByBasename = (
        dir: string,
        basename: string,
      ): Effect.Effect<string | undefined, IoError> =>
        fs.readDirectory(dir, { recursive: true }).pipe(
          Effect.map((entries) => {
            const match = entries.find((entry) => path.basename(entry) === basename);
            return match === undefined ? undefined : path.join(dir, match);
          }),
          Effect.catch((error: PlatformError.PlatformError) =>
            isNotFound(error) ? Effect.succeed(undefined) : Effect.fail(toIoError(dir, error)),
          ),
        );

      const ensureDepotDownloader = Effect.fn("ToolCache.ensureDepotDownloader")(function* (
        root: string,
      ) {
        const toolDir = paths.depotToolDir(root);
        const binaryName = depotBinaryName(platform.os);
        const existing = yield* findByBasename(toolDir, binaryName);
        if (existing !== undefined) {
          return existing;
        }

        const zipName = depotZipName(platform.os, platform.arch);
        if (zipName === undefined) {
          return yield* new ToolDownloadFailed({
            message: `Unsupported platform for DepotDownloader: ${platform.os}-${platform.arch}`,
          });
        }

        yield* github.downloadLatestAsset(DEPOT_REPO, toolDir, (name) => name === zipName);

        const downloaded = yield* findByBasename(toolDir, binaryName);
        if (downloaded === undefined) {
          return yield* new ToolDownloadFailed({
            message: `DepotDownloader binary not found after download in ${toolDir}`,
          });
        }
        return downloaded;
      });

      const findJpexsLaunch = (toolDir: string): Effect.Effect<JpexsLaunch | undefined, IoError> =>
        Effect.gen(function* () {
          const cli = yield* findByBasename(toolDir, "ffdec-cli.exe");
          if (cli !== undefined) {
            return { kind: "cli" as const, path: cli };
          }

          const scriptName = platform.os === "win32" ? "ffdec.bat" : "ffdec.sh";
          const script = yield* findByBasename(toolDir, scriptName);
          if (script !== undefined) {
            return { kind: "script" as const, path: script };
          }

          const jar = yield* findByBasename(toolDir, "ffdec.jar");
          if (jar !== undefined) {
            return { kind: "jar" as const, path: jar };
          }

          return undefined;
        });

      const ensureJpexs = Effect.fn("ToolCache.ensureJpexs")(function* (root: string) {
        const toolDir = paths.jpexsToolDir(root);
        const existing = yield* findJpexsLaunch(toolDir);
        if (existing !== undefined) {
          return existing;
        }

        yield* github.downloadLatestAsset(JPEXS_REPO, toolDir, jpexsZipPick);

        const downloaded = yield* findJpexsLaunch(toolDir);
        if (downloaded === undefined) {
          return yield* new ToolDownloadFailed({
            message: `JPEXS launcher not found after download in ${toolDir}`,
          });
        }
        return downloaded;
      });

      return { ensureDepotDownloader, ensureJpexs };
    }),
  );
}
