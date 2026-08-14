import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Stream } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import { ToolDownloadFailed } from "./errors.ts";
import { GithubRelease } from "./GithubRelease.ts";
import { ToolPlatform } from "./ToolPlatform.ts";

const ASSET_NAME = "tool-win-x64.zip";
const ASSET_URL = "https://example.test/tool.zip";
const RELEASE_JSON = `{
  "tag_name": "v1.0.0",
  "assets": [
    { "name": "other.tar.gz", "browser_download_url": "https://example.test/other.tar.gz" },
    { "name": "${ASSET_NAME}", "browser_download_url": "${ASSET_URL}" }
  ]
}`;

let zipBytes = new Uint8Array();

const fakeFetch: typeof globalThis.fetch = async (input) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url.includes("api.github.com")) {
    return new Response(RELEASE_JSON, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (url === ASSET_URL) {
    return new Response(zipBytes, { status: 200 });
  }
  return new Response("not found", { status: 404 });
};

const AppLive = GithubRelease.layer.pipe(
  Layer.provide(ToolPlatform.layer),
  Layer.provide(FetchHttpClient.layer),
  Layer.provideMerge(Layer.succeed(FetchHttpClient.Fetch, fakeFetch)),
  Layer.provideMerge(NodeServices.layer),
);

const runTar = Effect.fn("runTar")(function* (args: ReadonlyArray<string>) {
  const handle = yield* ChildProcess.make("tar", args);
  yield* Stream.runForEach(handle.all, () => Effect.void);
  return yield* handle.exitCode;
});

layer(AppLive)("GithubRelease", (it) => {
  it.effect("downloads matching asset and unpacks hello.txt", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const github = yield* GithubRelease;

      const srcDir = yield* fs.makeTempDirectory({ prefix: "gh-src-" });
      yield* fs.writeFileString(path.join(srcDir, "hello.txt"), "hello");
      const zipDir = yield* fs.makeTempDirectory({ prefix: "gh-zip-" });
      const zipPath = path.join(zipDir, ASSET_NAME);
      const zipCode = yield* runTar(["-a", "-cf", zipPath, "-C", srcDir, "hello.txt"]);
      expect(Number(zipCode)).toBe(0);
      zipBytes = yield* fs.readFile(zipPath);

      const destDir = yield* fs.makeTempDirectory({ prefix: "gh-dest-" });
      yield* github.downloadLatestAsset("owner/tool", destDir, (name) => name === ASSET_NAME);

      const unpacked = yield* fs.readFileString(path.join(destDir, "hello.txt"));
      expect(unpacked).toBe("hello");
      expect(yield* fs.exists(path.join(destDir, ASSET_NAME))).toBe(false);
    }),
  );

  it.effect("fails when no asset matches", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const github = yield* GithubRelease;
      const destDir = yield* fs.makeTempDirectory({ prefix: "gh-miss-" });
      const result = yield* Effect.result(
        github.downloadLatestAsset("owner/tool", destDir, (name) => name === "missing.zip"),
      );
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(ToolDownloadFailed);
    }),
  );
});
