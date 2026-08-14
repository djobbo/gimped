import { toIoError, type IoError } from "@gimped/common";
import { Context, Effect, FileSystem, Layer, Path, Schema, Stream } from "effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { USER_AGENT } from "./constants.ts";
import { ToolDownloadFailed } from "./errors.ts";
import { ToolPlatform } from "./ToolPlatform.ts";

const GithubAsset = Schema.Struct({
  name: Schema.String,
  browser_download_url: Schema.String,
});

const GithubLatestRelease = Schema.Struct({
  tag_name: Schema.String,
  assets: Schema.Array(GithubAsset),
});

const decodeReleaseJson = HttpClientResponse.schemaBodyJson(GithubLatestRelease);

type MessageError = { readonly message: string };

const toToolDownloadFailed = (error: MessageError): ToolDownloadFailed =>
  new ToolDownloadFailed({ message: error.message });

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

export class GithubRelease extends Context.Service<
  GithubRelease,
  {
    readonly downloadLatestAsset: (
      repo: string,
      destDir: string,
      pickAsset: (name: string) => boolean,
    ) => Effect.Effect<void, ToolDownloadFailed | IoError>;
  }
>()("@gimped/patch/GithubRelease") {
  static readonly layer: Layer.Layer<
    GithubRelease,
    never,
    HttpClient.HttpClient | FileSystem.FileSystem | Path.Path | ChildProcessSpawner | ToolPlatform
  > = Layer.effect(
    GithubRelease,
    Effect.gen(function* () {
      yield* ToolPlatform;
      const http = yield* HttpClient.HttpClient;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner;

      const downloadLatestAsset = Effect.fn("GithubRelease.downloadLatestAsset")(function* (
        repo: string,
        destDir: string,
        pickAsset: (name: string) => boolean,
      ) {
        const releaseResponse = yield* http
          .get(`https://api.github.com/repos/${repo}/releases/latest`, {
            headers: {
              "User-Agent": USER_AGENT,
              Accept: "application/vnd.github+json",
            },
          })
          .pipe(
            Effect.flatMap(HttpClientResponse.filterStatusOk),
            Effect.mapError(toToolDownloadFailed),
          );

        const release = yield* decodeReleaseJson(releaseResponse).pipe(
          Effect.mapError(toToolDownloadFailed),
        );

        const asset = release.assets.find((item) => pickAsset(item.name));
        if (asset === undefined) {
          return yield* new ToolDownloadFailed({
            message: `No matching asset in ${repo} ${release.tag_name}`,
          });
        }

        const zipResponse = yield* http
          .get(asset.browser_download_url)
          .pipe(
            Effect.flatMap(HttpClientResponse.filterStatusOk),
            Effect.mapError(toToolDownloadFailed),
          );

        const buffer = yield* zipResponse.arrayBuffer.pipe(Effect.mapError(toToolDownloadFailed));

        yield* fs
          .makeDirectory(destDir, { recursive: true })
          .pipe(Effect.mapError((error) => toIoError(destDir, error)));

        const zipPath = path.join(destDir, asset.name);
        yield* fs
          .writeFile(zipPath, new Uint8Array(buffer))
          .pipe(Effect.mapError((error) => toIoError(zipPath, error)));

        const unpack = yield* Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* ChildProcess.make("tar", ["-xf", zipPath, "-C", destDir]);
            const chunks: Array<Uint8Array> = [];
            yield* Stream.runForEach(handle.all, (chunk) =>
              Effect.sync(() => {
                chunks.push(chunk);
              }),
            );
            const code = yield* handle.exitCode;
            return { code, chunks };
          }).pipe(Effect.provideService(ChildProcessSpawner, spawner)),
        ).pipe(Effect.mapError(toToolDownloadFailed));

        if (Number(unpack.code) !== 0) {
          const snippet = new TextDecoder().decode(concatChunks(unpack.chunks));
          return yield* new ToolDownloadFailed({
            message: `tar exited ${String(unpack.code)}: ${snippet.slice(0, 500)}`,
          });
        }

        yield* fs.remove(zipPath).pipe(Effect.mapError((error) => toIoError(zipPath, error)));
      });

      return { downloadLatestAsset };
    }),
  );
}
