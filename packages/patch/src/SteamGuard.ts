import { Context, Effect, Layer } from "effect";

export class SteamGuard extends Context.Service<
  SteamGuard,
  {
    readonly requestCode: Effect.Effect<string>;
  }
>()("@gimped/patch/SteamGuard") {
  static readonly succeed = (code: string): Layer.Layer<SteamGuard> =>
    Layer.succeed(SteamGuard, { requestCode: Effect.succeed(code) });
}
