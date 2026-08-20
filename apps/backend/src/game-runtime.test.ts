import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { createConnection } from "node:net";
import { GameRuntime } from "./game-runtime.ts";
import { MatchSetupSpec, MatchSpec } from "./match-spec.ts";

const spec = new MatchSpec({
  userId: 1,
  token: "gimped",
  levelId: 1,
  setup: MatchSetupSpec.default,
});

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

layer(GameRuntime.layerFake)("GameRuntime fake", (it) => {
  it.effect("allocate returns stub ports without spawning", () =>
    Effect.gen(function* () {
      const runtime = yield* GameRuntime;
      const allocated = yield* runtime.allocate(spec);
      expect(allocated.host).toBe("127.0.0.1");
      expect(allocated.tcpPort).toBe(23011);
      expect(allocated.token).toBe("gimped");
    }),
  );
});

layer(GameRuntime.layerChildProcess.pipe(Layer.provide(NodeServices.layer)), {
  excludeTestServices: true,
})("GameRuntime child process", (it) => {
  it.effect(
    "allocate starts game listen and release kills it",
    () =>
      Effect.gen(function* () {
        const runtime = yield* GameRuntime;
        const allocated = yield* runtime.allocate(spec);
        expect(allocated.host).toBe("127.0.0.1");
        expect(allocated.tcpPort).toBeGreaterThan(0);
        yield* connectTcp(allocated.host, allocated.tcpPort);
        yield* runtime.release(allocated.id);
      }),
    20_000,
  );
});
