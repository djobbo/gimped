import { NodeSocketServer } from "@effect/platform-node";
import { NetSocket } from "@effect/platform-node/NodeSocket";
import { Deferred, Effect, Ref, Schema } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import { runGameChildLoop } from "../game-child-loop.ts";
import { GameChildRuntime } from "../game-child-runtime.ts";
import { encodeFrame, FrameDecoder } from "../framing.ts";
import type { TcpFrame } from "../messages.ts";
import { observeGameFrame, shouldLogGameFrame } from "../game-observe.ts";
import {
  GameListenReady,
  GameListenReadyLine,
  MatchSetupSpec,
  decodeSetupArgEffect,
  encodeSetupArg,
} from "../match-spec.ts";
import { bindUdp, runUdpListener } from "../udp-bind.ts";
import type { GameChildPhase } from "../game-child-model.ts";

const logFrame = Effect.fn("logFrame")(function* (
  dir: "inbound" | "outbound",
  frame: Parameters<typeof observeGameFrame>[0],
  phase: GameChildPhase,
) {
  if (!shouldLogGameFrame(frame.type, phase)) return;
  const observed = observeGameFrame(frame);
  yield* Effect.log(`game ${dir} type=${frame.type} ${observed.summary}`);
});

const writeFrames = Effect.fn("writeFrames")(function* (
  write: (bytes: Uint8Array) => Effect.Effect<void>,
  frames: ReadonlyArray<TcpFrame>,
  phase: GameChildPhase,
) {
  for (const frame of frames) {
    yield* logFrame("outbound", frame, phase);
    const bytes = encodeFrame(frame);
    yield* write(bytes);
  }
});

export const gameListen = Command.make(
  "listen",
  {
    userId: Flag.integer("user-id").pipe(Flag.withDescription("Packed user id expected in 10405")),
    token: Flag.string("token").pipe(Flag.withDescription("Game session token expected in 10405")),
    levelId: Flag.integer("level-id").pipe(Flag.withDescription("LevelType id advertised in 2466")),
    setup: Flag.string("setup").pipe(
      Flag.withDefault(encodeSetupArg(MatchSetupSpec.default)),
      Flag.withDescription("JSON MatchSetupSpec from the parent stub"),
    ),
    bindHost: Flag.string("bind-host").pipe(
      Flag.withDefault("127.0.0.1"),
      Flag.withDescription("Local bind address for game TCP+UDP"),
    ),
    advertiseHost: Flag.string("advertise-host").pipe(
      Flag.withDefault("127.0.0.1"),
      Flag.withDescription("Host advertised to the client in 2466 / ready line"),
    ),
  },
  Effect.fn("gameListen")(function* (config) {
    const setup = yield* decodeSetupArgEffect(config.setup);
    const includeBot = setup.bots.length > 0;
    yield* Effect.scoped(
      Effect.gen(function* () {
        const udp = yield* bindUdp(config.bindHost);
        const runtime = yield* GameChildRuntime.make({
          includeBot,
          userId: config.userId,
          token: config.token,
          levelId: config.levelId,
          setup,
        });
        const shutdownDeferred = yield* Deferred.make<void, never>();
        const nextConnectionId = yield* Ref.make(1);
        const tcpWriteRef = yield* Ref.make<
          ReadonlyMap<number, (bytes: Uint8Array) => Effect.Effect<void>>
        >(new Map());

        yield* runUdpListener(udp.socket, (payload, remote) =>
          Effect.gen(function* () {
            const reply = yield* runtime.ingestUdp(payload);
            const writers = yield* Ref.get(tcpWriteRef);
            const phase = yield* runtime.phase;
            for (const [connectionId, write] of writers) {
              const pending = yield* runtime.drainPendingTcp(connectionId);
              yield* writeFrames(write, pending, phase);
            }
            if (reply === undefined) return;
            yield* Effect.callback<void>((resume) => {
              udp.socket.send(reply, remote.port, remote.address, () => resume(Effect.void));
            });
          }),
        ).pipe(Effect.forkScoped);

        yield* runGameChildLoop(runtime, tcpWriteRef).pipe(Effect.forkScoped);

        const server = yield* NodeSocketServer.make({ host: config.bindHost, port: 0 });
        if (server.address._tag !== "TcpAddress") {
          return yield* Effect.die("game listen expected TCP address");
        }
        const ready = new GameListenReady({
          host: config.advertiseHost,
          tcpPort: server.address.port,
          udpPort: udp.port,
        });
        yield* server
          .run((socket) =>
            Effect.scoped(
              Effect.gen(function* () {
                const connectionId = yield* Ref.getAndUpdate(nextConnectionId, (n) => n + 1);
                yield* runtime.registerConnection(connectionId, config.userId);
                yield* runtime.connect();
                const decoder = new FrameDecoder();
                const write = yield* socket.writer;
                const netSocket = yield* NetSocket;
                yield* Effect.sync(() => {
                  netSocket.setNoDelay(true);
                });
                yield* Ref.update(tcpWriteRef, (writers) => {
                  const next = new Map(writers);
                  next.set(connectionId, write);
                  return next;
                });
                yield* Effect.addFinalizer(() =>
                  Effect.gen(function* () {
                    yield* Ref.update(tcpWriteRef, (writers) => {
                      const next = new Map(writers);
                      next.delete(connectionId);
                      return next;
                    });
                    yield* runtime.unregisterConnection(connectionId);
                  }),
                );
                yield* socket
                  .run((chunk) =>
                    Effect.gen(function* () {
                      const phase = yield* runtime.phase;
                      for (const frame of decoder.push(chunk)) {
                        yield* logFrame("inbound", frame, phase);
                        const replies = yield* runtime.ingest(frame, connectionId);
                        const replyPhase = yield* runtime.phase;
                        yield* writeFrames(write, replies, replyPhase);
                        const pending = yield* runtime.drainPendingTcp(connectionId);
                        yield* writeFrames(write, pending, replyPhase);
                        if (yield* runtime.shouldCloseConnection(connectionId)) {
                          yield* Ref.update(tcpWriteRef, (writers) => {
                            const next = new Map(writers);
                            next.delete(connectionId);
                            return next;
                          });
                        }
                        if (yield* runtime.shouldShutdown) {
                          yield* Deferred.complete(shutdownDeferred, Effect.void);
                        }
                      }
                    }),
                  )
                  .pipe(
                    Effect.catchCause((cause) =>
                      Effect.gen(function* () {
                        yield* Effect.log(`game connection ${connectionId} closed: ${cause}`);
                        yield* runtime.unregisterConnection(connectionId);
                      }),
                    ),
                  );
              }),
            ),
          )
          .pipe(Effect.forkScoped);
        yield* Effect.sync(() => {
          process.stdout.write(`${Schema.encodeUnknownSync(GameListenReadyLine)(ready)}\n`);
        });
        yield* Deferred.await(shutdownDeferred);
      }),
    );
  }),
).pipe(Command.withDescription("Listen for Brawlhalla game-server TCP+UDP"));
