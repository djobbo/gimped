import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import { CachePaths } from "./CachePaths.ts";
import { DepotClient } from "./DepotClient.ts";
import { DepotDownloadFailed, MissingSteamCredentials } from "./errors.ts";
import { ToolCache } from "./ToolCache.ts";

const MockToolCache = Layer.succeed(ToolCache, {
  ensureDepotDownloader: () => Effect.die("ensureDepotDownloader should not be called"),
  ensureJpexs: () => Effect.die("ensureJpexs should not be called"),
});

const AppLive = DepotClient.layer.pipe(
  Layer.provide(MockToolCache),
  Layer.provideMerge(CachePaths.layer),
  Layer.provideMerge(NodeServices.layer),
);

layer(AppLive)("DepotClient", (it) => {
  it.effect("parses Manifest <id> (", () =>
    Effect.gen(function* () {
      const client = yield* DepotClient;
      const id = yield* client.parseManifestId("Manifest 555 (1/1/2020)");
      expect(id).toBe("555");
    }),
  );

  it.effect("parses Already have manifest <id>", () =>
    Effect.gen(function* () {
      const client = yield* DepotClient;
      const id = yield* client.parseManifestId("Already have manifest 777 for depot 291551.");
      expect(id).toBe("777");
    }),
  );

  it.effect("fails DepotDownloadFailed when output has no manifest id", () =>
    Effect.gen(function* () {
      const client = yield* DepotClient;
      const result = yield* Effect.result(client.parseManifestId("nope"));
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(DepotDownloadFailed);
    }),
  );

  it.effect("fails MissingSteamCredentials when Config map is empty", () =>
    Effect.gen(function* () {
      const client = yield* DepotClient;
      const result = yield* Effect.result(client.resolvePublicManifest("/tmp/gimped-test"));
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(MissingSteamCredentials);
      }
    }).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({})))),
  );
});
