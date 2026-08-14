import { MessageChannel } from "node:worker_threads";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Layer, Stream } from "effect";
import { RpcClient, RpcSerialization, RpcServer } from "effect/unstable/rpc";
import { type IpcClientPort, layerIpcClient, makeIpcClientProtocol } from "../shared/rpc-client.ts";
import { PingRpcs } from "../shared/ping-rpc.ts";
import { clientAdapter, serverAdapter } from "./harness.ts";
import { layerIpcServer, RpcPortHandoff } from "./ipc-server.ts";

const serverConfig = { disableFatalDefects: true } as const;

const makeServer = <H extends Parameters<typeof PingRpcs.of>[0]>(handlers: H) =>
  RpcServer.layer(PingRpcs, serverConfig).pipe(
    Layer.provide(PingRpcs.toLayer(handlers)),
    Layer.provideMerge(layerIpcServer),
  );

describe("layerIpc transport (client ⇄ server over a MessagePort)", () => {
  it("round-trips a unary Ping call", async () => {
    const channel = new MessageChannel();
    const server = makeServer({
      Ping: () => Effect.succeed("pong"),
      Ticks: () => Stream.empty,
    });
    const program = Effect.gen(function* () {
      const handoff = yield* RpcPortHandoff;
      handoff.bind(serverAdapter(channel.port2));
      const client = yield* RpcClient.make(PingRpcs);
      return yield* client.Ping();
    }).pipe(
      Effect.provide(layerIpcClient(clientAdapter(channel.port1))),
      Effect.provide(server),
      Effect.scoped,
    );

    const result = await Effect.runPromise(program);

    expect(result).toBe("pong");

    channel.port1.close();
    channel.port2.close();
  });

  it("delivers a server-streamed sequence of values in order", async () => {
    const channel = new MessageChannel();
    const server = makeServer({
      Ping: () => Effect.never,
      Ticks: () => Stream.fromIterable([1, 2, 3]),
    });
    const program = Effect.gen(function* () {
      const handoff = yield* RpcPortHandoff;
      handoff.bind(serverAdapter(channel.port2));
      const client = yield* RpcClient.make(PingRpcs);
      return yield* Stream.runCollect(client.Ticks());
    }).pipe(
      Effect.provide(layerIpcClient(clientAdapter(channel.port1))),
      Effect.provide(server),
      Effect.scoped,
    );

    const emissions = await Effect.runPromise(program);

    expect(emissions).toStrictEqual([1, 2, 3]);

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
      Ping: () => Effect.never,
      Ticks: () =>
        Stream.make(1).pipe(
          Stream.concat(Stream.never),
          Stream.onExit((exit) => Effect.sync(() => resolveInterrupted(exit))),
        ),
    });

    const program = Effect.gen(function* () {
      const handoff = yield* RpcPortHandoff;
      handoff.bind(serverAdapter(channel1.port2));
      const client = yield* RpcClient.make(PingRpcs);

      yield* Effect.forkScoped(
        Stream.runForEach(client.Ticks(), () => Effect.sync(() => resolveFirst())),
      );
      yield* Effect.promise(() => gotFirst);

      // Swap in a fresh port: the old client is offered to `disconnects`, which
      // RpcServer drains to interrupt its in-flight Ticks fiber.
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
