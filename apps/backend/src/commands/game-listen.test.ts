import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, Option, Schema, Stream } from "effect";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import { GameListenReadyLine } from "../match-spec.ts";

const bin = fileURLToPath(new URL("../bin.ts", import.meta.url));

const readyLine = (text: string): boolean => {
  try {
    Schema.decodeUnknownSync(GameListenReadyLine)(text);
    return true;
  } catch {
    return false;
  }
};

const connectTcp = (host: string, port: number) =>
  Effect.callback<void, Error>((resume) => {
    const conn = createConnection({ host, port });
    const finish = (effect: Effect.Effect<void, Error>) => {
      conn.destroy();
      resume(effect);
    };
    conn.once("connect", () => finish(Effect.void));
    conn.once("error", (error) => finish(Effect.fail(error)));
  }).pipe(Effect.timeout("3 seconds"));

layer(NodeServices.layer, { excludeTestServices: true })("game listen", (it) => {
  it.effect(
    "prints a ready line and accepts TCP on the reported port",
    () =>
      Effect.gen(function* () {
        const handle = yield* ChildProcess.make(
          process.execPath,
          [
            "--experimental-transform-types",
            bin,
            "game",
            "listen",
            "--user-id",
            "1",
            "--token",
            "gimped",
            "--level-id",
            "1",
          ],
          { stdout: "pipe", stdin: "ignore" },
        );
        yield* Effect.addFinalizer(() =>
          handle.kill({ forceKillAfter: "1 second" }).pipe(Effect.ignore),
        );
        const line = yield* Stream.decodeText(handle.stdout).pipe(
          Stream.splitLines,
          Stream.filter((text) => text.length > 0 && readyLine(text)),
          Stream.map((text) => Schema.decodeUnknownSync(GameListenReadyLine)(text)),
          Stream.take(1),
          Stream.runHead,
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new Error("game listen printed no ready line")),
              onSome: (ready) => Effect.succeed(ready),
            }),
          ),
          Effect.timeout("10 seconds"),
        );
        expect(line.host).toBe("127.0.0.1");
        expect(line.tcpPort).toBeGreaterThan(0);
        expect(line.udpPort).toBeGreaterThan(0);
        yield* connectTcp(line.host, line.tcpPort);
      }).pipe(Effect.scoped),
    20_000,
  );
});
