import {
  Context,
  Deferred,
  Effect,
  Layer,
  Option,
  Path,
  Ref,
  Schema,
  Scope,
  Semaphore,
  Stream,
} from "effect";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import {
  type ChildProcessHandle,
  ChildProcessSpawner,
} from "effect/unstable/process/ChildProcessSpawner";
import process from "node:process";
import { GameListenReady, GameListenReadyLine, MatchSpec, encodeSetupArg } from "./match-spec.ts";
import { packageRoot } from "./session.ts";

export class GameListenTimeout extends Schema.TaggedError<GameListenTimeout>()(
  "GameListenTimeout",
  {
    message: Schema.String,
  },
) {}

export type Allocation = {
  readonly id: string;
  readonly host: string;
  readonly tcpPort: number;
  readonly udpPort: number;
  readonly token: string;
};

type LiveChild = {
  readonly id: string;
  readonly handle: ChildProcessHandle;
};

const isReadyLine = (text: string): boolean => {
  try {
    Schema.decodeUnknownSync(GameListenReadyLine)(text);
    return text.length > 0;
  } catch {
    return false;
  }
};

export class GameRuntime extends Context.Service<
  GameRuntime,
  {
    readonly allocate: (spec: MatchSpec) => Effect.Effect<Allocation, GameListenTimeout>;
    readonly release: (id: string) => Effect.Effect<void>;
  }
>()("@gimped/backend/GameRuntime") {
  static readonly layerFake: Layer.Layer<GameRuntime> = Layer.succeed(GameRuntime, {
    allocate: (spec) =>
      Effect.succeed({
        id: "fake",
        host: "127.0.0.1",
        tcpPort: 23011,
        udpPort: 23012,
        token: spec.token,
      }),
    release: (_id) => Effect.void,
  });

  static readonly layerChildProcess: Layer.Layer<
    GameRuntime,
    never,
    ChildProcessSpawner | Path.Path
  > = Layer.effect(
    GameRuntime,
    Effect.gen(function* () {
      const scope = yield* Scope.Scope;
      const path = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner;
      const mutex = yield* Semaphore.make(1);
      const nextId = yield* Ref.make(1);
      const live = yield* Ref.make<Option.Option<LiveChild>>(Option.none());
      const bin = path.join(packageRoot, "src", "bin.ts");

      const clear = Effect.fn("GameRuntime.clear")(function* () {
        yield* Ref.set(live, Option.none());
        yield* mutex.release(1);
      });

      const allocate = Effect.fn("GameRuntime.allocate")(function* (spec: MatchSpec) {
        yield* mutex.take(1);
        const command = ChildProcess.make(
          process.execPath,
          [
            "--experimental-transform-types",
            bin,
            "game",
            "listen",
            "--user-id",
            String(spec.userId),
            "--token",
            spec.token,
            "--level-id",
            String(spec.levelId),
            "--setup",
            encodeSetupArg(spec.setup),
          ],
          { stdout: "pipe", stdin: "ignore" },
        );
        const handle = yield* spawner.spawn(command).pipe(
          Effect.provideService(Scope.Scope, scope),
          Effect.tapError(() => mutex.release(1)),
        );
        yield* Effect.forkIn(handle.exitCode.pipe(Effect.ensuring(clear())), scope);
        const readyDeferred = yield* Deferred.make<GameListenReady, GameListenTimeout>();
        yield* Effect.forkIn(
          Stream.decodeText(handle.stdout).pipe(
            Stream.splitLines,
            Stream.filter((text) => text.length > 0),
            Stream.tap((line) =>
              Effect.gen(function* () {
                if (isReadyLine(line)) {
                  yield* Deferred.complete(
                    readyDeferred,
                    Effect.succeed(Schema.decodeUnknownSync(GameListenReadyLine)(line)),
                  ).pipe(Effect.ignore);
                  return;
                }
                yield* Effect.sync(() => {
                  process.stderr.write(`${line}\n`);
                });
              }),
            ),
            Stream.runDrain,
          ),
          scope,
        );
        const ready = yield* Deferred.await(readyDeferred).pipe(
          Effect.mapError(
            () =>
              new GameListenTimeout({
                message: "game listen printed no ready line",
              }),
          ),
          Effect.timeoutOrElse({
            duration: "10 seconds",
            orElse: () =>
              Effect.gen(function* () {
                yield* handle.kill({ forceKillAfter: "1 second" }).pipe(Effect.ignore);
                return yield* new GameListenTimeout({
                  message: "game listen ready timed out",
                });
              }),
          }),
        );
        const id = String(yield* Ref.getAndUpdate(nextId, (n) => n + 1));
        yield* Ref.set(live, Option.some({ id, handle }));
        return {
          id,
          host: ready.host,
          tcpPort: ready.tcpPort,
          udpPort: ready.udpPort,
          token: spec.token,
        };
      });

      const release = Effect.fn("GameRuntime.release")(function* (id: string) {
        const current = yield* Ref.get(live);
        if (Option.isSome(current) && current.value.id === id) {
          yield* current.value.handle.kill({ forceKillAfter: "1 second" }).pipe(Effect.ignore);
        }
      });

      return { allocate, release };
    }),
  );
}
