import { MessageChannel } from "node:worker_threads";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Layer, Stream } from "effect";
import { RpcClient, RpcSerialization, RpcServer } from "effect/unstable/rpc";
import { ClientRpcs } from "../shared/client-rpc.ts";
import { type IpcClientPort, layerIpcClient, makeIpcClientProtocol } from "../shared/rpc-client.ts";
import { clientAdapter, serverAdapter } from "./harness.ts";
import { layerIpcServer, RpcPortHandoff } from "./ipc-server.ts";

const serverConfig = { disableFatalDefects: true } as const;

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

const started = { _tag: "StepStarted" as const, step: "DownloadDepot" as const };
const completed = { _tag: "Completed" as const, registry: sampleRegistry };

const unused = {
  PatchClear: () => Effect.void,
  SubmitSteamGuard: () => Effect.void,
  SettingsSet: () => Effect.void,
};

const makeServer = <H extends Parameters<typeof ClientRpcs.of>[0]>(handlers: H) =>
  RpcServer.layer(ClientRpcs, serverConfig).pipe(
    Layer.provide(ClientRpcs.toLayer(handlers)),
    Layer.provideMerge(layerIpcServer),
  );

describe("layerIpc transport (client ⇄ server over a MessagePort)", () => {
  it("round-trips a unary SettingsGet call", async () => {
    const channel = new MessageChannel();
    const server = makeServer({
      ...unused,
      SettingsGet: () => Effect.succeed({ username: "alice", hasPassword: true }),
      PatchFetch: () => Stream.empty,
    });
    const program = Effect.gen(function* () {
      const handoff = yield* RpcPortHandoff;
      handoff.bind(serverAdapter(channel.port2));
      const client = yield* RpcClient.make(ClientRpcs);
      return yield* client.SettingsGet();
    }).pipe(
      Effect.provide(layerIpcClient(clientAdapter(channel.port1))),
      Effect.provide(server),
      Effect.scoped,
    );

    const result = await Effect.runPromise(program);

    expect(result).toEqual({ username: "alice", hasPassword: true });

    channel.port1.close();
    channel.port2.close();
  });

  it("delivers a server-streamed sequence of PatchEvents in order", async () => {
    const channel = new MessageChannel();
    const server = makeServer({
      ...unused,
      SettingsGet: () => Effect.never,
      PatchFetch: () => Stream.fromIterable([started, completed]),
    });
    const program = Effect.gen(function* () {
      const handoff = yield* RpcPortHandoff;
      handoff.bind(serverAdapter(channel.port2));
      const client = yield* RpcClient.make(ClientRpcs);
      return yield* Stream.runCollect(client.PatchFetch({ full: false, force: false }));
    }).pipe(
      Effect.provide(layerIpcClient(clientAdapter(channel.port1))),
      Effect.provide(server),
      Effect.scoped,
    );

    const emissions = await Effect.runPromise(program);

    expect(emissions).toStrictEqual([started, completed]);

    channel.port1.close();
    channel.port2.close();
  });

  it("interrupts the previous client's in-flight server stream on a port swap", async () => {
    let resolveFirst!: () => void;
    const gotFirst = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    let resolveInterrupted!: (exit: Exit.Exit<unknown, unknown>) => void;
    const interrupted = new Promise<Exit.Exit<unknown, unknown>>((resolve) => {
      resolveInterrupted = resolve;
    });

    const channel1 = new MessageChannel();
    const channel2 = new MessageChannel();
    const server = makeServer({
      ...unused,
      SettingsGet: () => Effect.never,
      PatchFetch: () =>
        Stream.make(started).pipe(
          Stream.concat(Stream.never),
          Stream.onExit((exit) => Effect.sync(() => resolveInterrupted(exit))),
        ),
    });

    const program = Effect.gen(function* () {
      const handoff = yield* RpcPortHandoff;
      handoff.bind(serverAdapter(channel1.port2));
      const client = yield* RpcClient.make(ClientRpcs);

      yield* Effect.forkScoped(
        Stream.runForEach(client.PatchFetch({ full: false, force: false }), () =>
          Effect.sync(() => resolveFirst()),
        ),
      );
      yield* Effect.promise(() => gotFirst);

      // Swap in a fresh port: the old client is offered to `disconnects`, which
      // RpcServer drains to interrupt its in-flight PatchFetch fiber.
      handoff.bind(serverAdapter(channel2.port2));

      return yield* Effect.promise(() => interrupted).pipe(
        Effect.timeoutOrElse({
          duration: "5 seconds",
          orElse: () =>
            Effect.fail(new Error("in-flight server stream was not interrupted on swap")),
        }),
      );
    }).pipe(
      Effect.provide(layerIpcClient(clientAdapter(channel1.port1))),
      Effect.provide(server),
      Effect.scoped,
    );

    const exit = await Effect.runPromise(program);

    expect(Exit.hasInterrupts(exit)).toBe(true);

    channel1.port1.close();
    channel1.port2.close();
    channel2.port1.close();
    channel2.port2.close();
  });

  it("client transport swallows a parser decode error instead of throwing in the message callback", async () => {
    const throwingSerialization = Layer.succeed(RpcSerialization.RpcSerialization, {
      contentType: "application/x-broken",
      includesFraming: true,
      makeUnsafe: () => ({
        decode: () => {
          throw new Error("bad frame");
        },
        encode: () => undefined,
      }),
    });
    let handler: ((event: { data: string | Uint8Array }) => void) | null = null;
    const fakePort: IpcClientPort = {
      get onmessage() {
        return handler;
      },
      set onmessage(next) {
        handler = next;
      },
      postMessage: () => {},
      start: () => {},
      close: () => {},
    };

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* makeIpcClientProtocol(fakePort);
        expect(handler).not.toBeNull();
        expect(() => handler?.({ data: new Uint8Array([1, 2, 3]) })).not.toThrow();
      }).pipe(Effect.provide(throwingSerialization), Effect.scoped),
    );
  });
});
