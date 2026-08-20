import { NodeSocketServer } from "@effect/platform-node";
import { Effect, Option, Ref, Schema } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import { runGameChildLoop } from "../game-child-loop.ts";
import { GameChildRuntime, type GameChildRuntimeService } from "../game-child-runtime.ts";
import { encodeFrame, FrameDecoder } from "../framing.ts";
import { observeGameFrame, shouldLogGameFrame } from "../game-observe.ts";
import {
  GameListenReady,
  GameListenReadyLine,
  MatchSetupSpec,
  decodeSetupArg,
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
  },
  Effect.fn("gameListen")(function* (config) {
    const setup = decodeSetupArg(config.setup);
    const includeBot = setup.bots.length > 0;
    yield* Effect.scoped(
      Effect.gen(function* () {
        const udp = yield* bindUdp("127.0.0.1");
        const runtimeRef = yield* Ref.make<Option.Option<GameChildRuntimeService>>(Option.none());
        const tcpWriteRef = yield* Ref.make<
          Option.Option<(bytes: Uint8Array) => Effect.Effect<void>>
        >(Option.none());
        yield* runUdpListener(udp.socket, (payload, remote) =>
          Effect.gen(function* () {
            const runtime = yield* Ref.get(runtimeRef);
            if (Option.isNone(runtime)) return;
            const reply = yield* runtime.value.ingestUdp(payload);
            const pending = yield* runtime.value.drainPendingTcp();
            const phase = yield* runtime.value.phase;
            for (const frame of pending) {
              yield* logFrame("outbound", frame, phase);
              const write = yield* Ref.get(tcpWriteRef);
              if (Option.isSome(write)) {
                yield* write.value(encodeFrame(frame));
              }
            }
            if (reply === undefined) return;
            yield* Effect.callback<void>((resume) => {
              udp.socket.send(reply, remote.port, remote.address, () => resume(Effect.void));
            });
          }),
        ).pipe(Effect.forkScoped);
        const server = yield* NodeSocketServer.make({ host: "127.0.0.1", port: 0 });
        if (server.address._tag !== "TcpAddress") {
          return yield* Effect.die("game listen expected TCP address");
        }
        const ready = new GameListenReady({
          host: "127.0.0.1",
          tcpPort: server.address.port,
          udpPort: udp.port,
        });
        yield* server
          .run((socket) =>
            Effect.scoped(
              Effect.gen(function* () {
                const runtime = yield* GameChildRuntime.make({
                  includeBot,
                  userId: config.userId,
                  token: config.token,
                  setup,
                });
                yield* Ref.set(runtimeRef, Option.some(runtime));
                yield* Effect.addFinalizer(() => Ref.set(runtimeRef, Option.none()));
                const decoder = new FrameDecoder();
                const write = yield* socket.writer;
                yield* Ref.set(tcpWriteRef, Option.some(write));
                yield* Effect.addFinalizer(() => Ref.set(tcpWriteRef, Option.none()));
                yield* runtime.connect();
                yield* runGameChildLoop(runtime, write).pipe(Effect.forkScoped);
                yield* socket
                  .run((chunk) =>
                    Effect.gen(function* () {
                      const phase = yield* runtime.phase;
                      for (const frame of decoder.push(chunk)) {
                        yield* logFrame("inbound", frame, phase);
                        const replies = yield* runtime.ingest(frame);
                        if (yield* runtime.shouldClose) return yield* Effect.interrupt;
                        const replyPhase = yield* runtime.phase;
                        for (const reply of replies) {
                          yield* logFrame("outbound", reply, replyPhase);
                          yield* write(encodeFrame(reply));
                        }
                        const pending = yield* runtime.drainPendingTcp();
                        for (const frame of pending) {
                          yield* logFrame("outbound", frame, replyPhase);
                          yield* write(encodeFrame(frame));
                        }
                      }
                    }),
                  )
                  .pipe(
                    Effect.catchCause((cause) =>
                      Effect.gen(function* () {
                        yield* Effect.log(`game connection closed: ${cause}`);
                        yield* runtime.disconnect();
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
        yield* Effect.never;
      }),
    );
  }),
).pipe(Command.withDescription("Listen for Brawlhalla game-server TCP+UDP"));
