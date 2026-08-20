import { NodeSocketServer } from "@effect/platform-node";
import { Effect, Option, Path } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import { homedir } from "node:os";
import { startTshark, watchDiagnostics } from "../capture.ts";
import { GameRuntime } from "../game-runtime.ts";
import { resolveListenHosts } from "../net-host.ts";
import { ConnectionHub } from "../connection-hub.ts";
import { RoomRegistry } from "../room-registry.ts";
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
      Flag.withDescription("Client-facing host (-h / game 2466). Non-loopback IPs bind on 0.0.0.0"),
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
        const { bindHost, advertiseHost } = resolveListenHosts(config.host);

        yield* Effect.log(launchHelp(advertiseHost, config.port));
        if (advertiseHost !== bindHost) {
          yield* Effect.log(
            `Remote host: bind=${bindHost} advertise=${advertiseHost} (game 2466 uses advertise)`,
          );
        }
        yield* watchDiagnostics(session.dir, docs, session.note);

        if (config.tshark) {
          yield* startTshark(config.port, path.join(session.dir, "capture.pcapng"));
        }

        yield* runStub(session, { label: "backend", startId: 1 }).pipe(
          Effect.provide(NodeSocketServer.layer({ host: bindHost, port: config.port })),
          Effect.provide(
            GameRuntime.layerChildProcess({
              bindHost,
              advertiseHost,
            }),
          ),
          Effect.provide(RoomRegistry.layerMemory),
          Effect.provide(ConnectionHub.layerMemory),
        );
      }),
    );
  }),
).pipe(Command.withDescription("Listen for Brawlhalla backend TCP and record packets"));
