import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { CachePaths, Pipeline, SteamGuard } from "@gimped/patch";
import { Deferred, Effect, Fiber, FileSystem, Layer, Queue, Stream } from "effect";
import { RpcTest } from "effect/unstable/rpc";
import { ClientRpcs } from "../shared/client-rpc.ts";
import { HandlersLive, SteamGuardLive, SteamGuardSlotLive } from "./handlers.ts";
import { SafeStorage } from "./steam-store.ts";

const sampleRegistry = {
  steamAppId: 291550,
  steamDepotId: 291551,
  steamManifestId: "1",
  fullDepot: false,
  clientBuild: "10090",
  swzKey: 762411009,
  swf: "BrawlhallaAir.swf",
  files: ["BrawlhallaAir.swf"],
};

const completed = { _tag: "Completed" as const, registry: sampleRegistry };

const identityStorage = (userData: string) => ({
  isEncryptionAvailable: () => true,
  encryptString: (plain: string) => new TextEncoder().encode(plain),
  decryptString: (bytes: Uint8Array) => new TextDecoder().decode(bytes),
  userData,
});

const mockPipeline = (overrides: {
  readonly fetchStream?: Pipeline["Service"]["fetchStream"];
  readonly clearPatch?: Pipeline["Service"]["clearPatch"];
}): Layer.Layer<Pipeline> =>
  Layer.succeed(Pipeline, {
    fetch: () => Effect.never,
    fetchStream: () => Stream.make(completed),
    clearPatch: () => Effect.void,
    ...overrides,
  });

const withClient = <A, E, R>(
  pipeline: Layer.Layer<Pipeline>,
  use: (
    client: Effect.Effect.Success<ReturnType<typeof RpcTest.makeClient<typeof ClientRpcs>>>,
  ) => Effect.Effect<A, E, R>,
  storage: (userData: string) => SafeStorage["Service"] = identityStorage,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const userData = yield* fs.makeTempDirectoryScoped({ prefix: "handlers-" });
    const client = yield* RpcTest.makeClient(ClientRpcs).pipe(
      Effect.provide(HandlersLive),
      Effect.provide(SteamGuardLive),
      Effect.provide(pipeline),
      Effect.provide(Layer.succeed(SafeStorage, storage(userData))),
      Effect.provide(CachePaths.layer),
      Effect.provide(SteamGuardSlotLive),
    );
    return yield* use(client);
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped);

describe("ClientRpcs handlers", () => {
  it.effect("PatchFetch streams Completed", () =>
    withClient(mockPipeline({}), (client) =>
      Effect.gen(function* () {
        yield* client.SettingsSet({ username: "alice", password: "s3cret" });
        const events = yield* Stream.runCollect(client.PatchFetch({ full: false, force: false }));
        expect(events).toEqual([completed]);
      }),
    ),
  );

  it.effect("PatchFetch after a failed setup is not FetchInProgress", () => {
    let failDecrypt = true;
    return withClient(
      mockPipeline({}),
      (client) =>
        Effect.gen(function* () {
          yield* client.SettingsSet({ username: "alice", password: "s3cret" });
          const error = yield* Effect.flip(
            Stream.runDrain(client.PatchFetch({ full: false, force: false })),
          );
          expect(error._tag).toBe("MissingSteamCredentials");
          const events = yield* Stream.runCollect(client.PatchFetch({ full: false, force: false }));
          expect(events).toEqual([completed]);
        }),
      (userData) => ({
        ...identityStorage(userData),
        decryptString: (bytes) => {
          if (failDecrypt) {
            failDecrypt = false;
            throw new Error("decrypt boom");
          }
          return new TextDecoder().decode(bytes);
        },
      }),
    );
  });

  it.effect("PatchFetch after interrupt is not FetchInProgress", () => {
    let first = true;
    return withClient(
      mockPipeline({
        fetchStream: () => {
          if (first) {
            first = false;
            return Stream.make({
              _tag: "StepStarted" as const,
              step: "DownloadDepot" as const,
            }).pipe(Stream.concat(Stream.never));
          }
          return Stream.make(completed);
        },
      }),
      (client) =>
        Effect.gen(function* () {
          yield* client.SettingsSet({ username: "alice", password: "s3cret" });
          const started = yield* Deferred.make<void>();
          const fiber = yield* Stream.runDrain(
            Stream.tap(client.PatchFetch({ full: false, force: false }), () =>
              Deferred.succeed(started, undefined),
            ),
          ).pipe(Effect.forkChild({ startImmediately: true }));
          yield* Deferred.await(started);
          yield* Fiber.interrupt(fiber);
          const events = yield* Stream.runCollect(client.PatchFetch({ full: false, force: false }));
          expect(events).toEqual([completed]);
        }),
    );
  });

  it.effect("second PatchFetch fails with FetchInProgress", () =>
    withClient(
      mockPipeline({
        fetchStream: () =>
          Stream.make({ _tag: "StepStarted" as const, step: "DownloadDepot" as const }).pipe(
            Stream.concat(Stream.never),
          ),
      }),
      (client) =>
        Effect.gen(function* () {
          yield* client.SettingsSet({ username: "alice", password: "s3cret" });
          const started = yield* Deferred.make<void>();
          const first = yield* Stream.runDrain(
            Stream.tap(client.PatchFetch({ full: false, force: false }), () =>
              Deferred.succeed(started, undefined),
            ),
          ).pipe(Effect.forkChild({ startImmediately: true }));
          yield* Deferred.await(started);
          const error = yield* Effect.flip(
            Stream.runDrain(client.PatchFetch({ full: false, force: false })),
          );
          expect(error._tag).toBe("FetchInProgress");
          yield* Fiber.interrupt(first);
        }),
    ),
  );

  it.effect("SubmitSteamGuard unblocks an in-flight PatchFetch", () =>
    withClient(
      mockPipeline({
        fetchStream: () =>
          Stream.callback((queue) =>
            Effect.gen(function* () {
              yield* Queue.offer(queue, { _tag: "SteamGuardRequired" as const });
              const guard = yield* SteamGuard;
              yield* guard.requestCode;
              yield* Queue.offer(queue, completed);
              yield* Queue.end(queue);
            }),
          ),
      }),
      (client) =>
        Effect.gen(function* () {
          yield* client.SettingsSet({ username: "alice", password: "s3cret" });
          const waiting = yield* Deferred.make<void>();
          const fiber = yield* Stream.runCollect(
            Stream.tap(client.PatchFetch({ full: false, force: false }), (event) =>
              event._tag === "SteamGuardRequired"
                ? Deferred.succeed(waiting, undefined)
                : Effect.void,
            ),
          ).pipe(Effect.forkChild({ startImmediately: true }));
          yield* Deferred.await(waiting);
          yield* client.SubmitSteamGuard({ code: "12345" });
          const events = yield* Fiber.join(fiber);
          expect(events.some((event) => event._tag === "Completed")).toBe(true);
        }),
    ),
  );

  it.effect("PatchClear with no id fails NothingToClear", () =>
    withClient(mockPipeline({}), (client) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const cacheDir = yield* fs.makeTempDirectoryScoped({ prefix: "clear-" });
        const error = yield* Effect.flip(client.PatchClear({ cacheDir }));
        expect(error._tag).toBe("NothingToClear");
      }),
    ),
  );

  it.effect("SettingsSet then SettingsGet reports hasPassword", () =>
    withClient(mockPipeline({}), (client) =>
      Effect.gen(function* () {
        yield* client.SettingsSet({ username: "alice", password: "s3cret" });
        const status = yield* client.SettingsGet();
        expect(status).toEqual({ username: "alice", hasPassword: true });
      }),
    ),
  );
});
