import { Console, Effect, Option, Path } from "effect";
import { NodeSocketServer } from "@effect/platform-node";
import { Command, Flag } from "effect/unstable/cli";
import { homedir } from "node:os";
import { STUB_GAME_TCP_PORT } from "../assign-game-server.ts";
import { startTshark, watchDiagnostics } from "../capture.ts";
import { createSession, packageRoot } from "../session.ts";
import { runStub } from "../stub.ts";

const launchHelp = (host: string, port: number): string =>
  [
    "",
    "Point Brawlhalla at this stub (class_42.as -h/-p, class_139.method_3356):",
    "",
    "  Steam launch options:",
    `    -h ${host} -p ${port} -diagnosticlog`,
    "",
    "  Or run Brawlhalla.exe with those arguments.",
    "",
    "Then start the game and wait at the menu. Do not queue a match yet.",
    "The client should TCP-connect and send protocolHello + clientVersion",
    "(class_139.method_7603). Leave this server running.",
    "",
  ].join("\n");

export const listen = Command.make(
  "listen",
  {
    host: Flag.string("host").pipe(
      Flag.withDefault("127.0.0.1"),
      Flag.withDescription("Bind address for the backend TCP stub"),
    ),
    port: Flag.integer("port").pipe(
      Flag.withDefault(23001),
      Flag.withDescription("Bind port (class_50.method_977 default is 23001/23002; -p overrides)"),
    ),
    out: Flag.string("out").pipe(
      Flag.optional,
      Flag.withDescription("Capture root directory (session subfolder is created)"),
    ),
    tshark: Flag.boolean("tshark").pipe(
      Flag.withDefault(true),
      Flag.withDescription("Start tshark on the bind port when Wireshark is installed"),
    ),
    documents: Flag.string("documents").pipe(
      Flag.optional,
      Flag.withDescription("Folder to watch for Brawlhalla-Diagnostic-Log-*.txt"),
    ),
  },
  Effect.fn("listen")(function* (config) {
    yield* Effect.scoped(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const outRoot = Option.getOrElse(config.out, () => path.join(packageRoot, "captures"));
        const session = yield* createSession(outRoot);
        const docs = Option.getOrElse(config.documents, () => path.join(homedir(), "Documents"));

        yield* Console.log(launchHelp(config.host, config.port));
        yield* watchDiagnostics(session.dir, docs, session.note);

        if (config.tshark) {
          yield* startTshark(config.port, path.join(session.dir, "capture.pcapng"));
        }

        yield* Effect.all(
          [
            runStub(session, { label: "backend", startId: 1 }).pipe(
              Effect.provide(NodeSocketServer.layer({ host: config.host, port: config.port })),
            ),
            runStub(session, { label: "game", startId: 1000 }).pipe(
              Effect.provide(
                NodeSocketServer.layer({ host: config.host, port: STUB_GAME_TCP_PORT }),
              ),
            ),
          ],
          { concurrency: 2 },
        );
      }),
    );
  }),
).pipe(Command.withDescription("Listen for Brawlhalla backend TCP and record packets"));
