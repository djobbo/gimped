import { NodeSocketServer } from "@effect/platform-node";
import { Console, Effect, Schema } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import { runGameChildLoop } from "../game-child-loop.ts";
import { GameChildRuntime } from "../game-child-runtime.ts";
import { encodeFrame, FrameDecoder } from "../framing.ts";
import { observeGameFrame, recordUnknownGamePacket } from "../game-observe.ts";
import { GameListenReady, GameListenReadyLine } from "../match-spec.ts";
import { bindUdp } from "../udp-bind.ts";

const logFrame = Effect.fn("logFrame")(function* (
  dir: "inbound" | "outbound",
  frame: Parameters<typeof observeGameFrame>[0],
) {
  const observed = observeGameFrame(frame);
  yield* Console.log(`game ${dir} type=${frame.type} ${observed.summary}`);
  if (!observed.known) {
    yield* recordUnknownGamePacket({
      dir: dir === "inbound" ? "client" : "server",
      type: frame.type,
      payload: frame.payload,
    });
  }
});

export const gameListen = Command.make(
  "listen",
  {
    userId: Flag.integer("user-id").pipe(Flag.withDescription("Packed user id expected in 10405")),
    token: Flag.string("token").pipe(Flag.withDescription("Game session token expected in 10405")),
    levelId: Flag.integer("level-id").pipe(Flag.withDescription("LevelType id advertised in 2466")),
    bot: Flag.boolean("bot").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Include the stub bot in 10310"),
    ),
  },
  Effect.fn("gameListen")(function* (config) {
    yield* Effect.scoped(
      Effect.gen(function* () {
        const udp = yield* bindUdp("127.0.0.1");
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
                  includeBot: config.bot,
                  userId: config.userId,
                  token: config.token,
                });
                const decoder = new FrameDecoder();
                const write = yield* socket.writer;
                yield* runtime.connect();
                yield* runGameChildLoop(runtime, write).pipe(Effect.forkScoped);
                yield* socket.run((chunk) =>
                  Effect.gen(function* () {
                    for (const frame of decoder.push(chunk)) {
                      yield* logFrame("inbound", frame);
                      const replies = yield* runtime.ingest(frame);
                      if (yield* runtime.shouldClose) return yield* Effect.interrupt;
                      for (const reply of replies) {
                        yield* logFrame("outbound", reply);
                        yield* write(encodeFrame(reply));
                      }
                    }
                  }),
                );
              }),
            ),
          )
          .pipe(Effect.forkScoped);
        yield* Console.log(Schema.encodeUnknownSync(GameListenReadyLine)(ready));
        yield* Effect.never;
      }),
    );
  }),
).pipe(Command.withDescription("Listen for Brawlhalla game-server TCP+UDP"));
