import { Context, Effect, Layer, Option, Stdio, Stream } from "effect";

export class SteamGuard extends Context.Service<
  SteamGuard,
  {
    readonly requestCode: Effect.Effect<string>;
  }
>()("@gimped/patch/SteamGuard") {
  static readonly succeed = (code: string): Layer.Layer<SteamGuard> =>
    Layer.succeed(SteamGuard, { requestCode: Effect.succeed(code) });

  static readonly layerStdin: Layer.Layer<SteamGuard, never, Stdio.Stdio> = Layer.effect(
    SteamGuard,
    Effect.gen(function* () {
      const stdio = yield* Stdio.Stdio;
      return {
        requestCode: Effect.fn("SteamGuard.requestCode")(function* () {
          const line = yield* stdio.stdin.pipe(
            Stream.decodeText(),
            Stream.splitLines,
            Stream.take(1),
            Stream.runHead,
            Effect.orDie,
          );
          return Option.getOrElse(line, () => "").trim();
        })(),
      };
    }),
  );
}
