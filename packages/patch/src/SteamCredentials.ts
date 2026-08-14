import { Config, Context, Effect, Layer, Option } from "effect";
import { MissingSteamCredentials } from "./errors.ts";

const readSteamCredential = Effect.fn("SteamCredentials.readSteamCredential")(function* (
  name: string,
) {
  const value = yield* Config.string(name).pipe(
    Config.option,
    Effect.mapError(
      () =>
        new MissingSteamCredentials({
          message: `${name} is missing or empty`,
        }),
    ),
  );
  if (Option.isNone(value) || value.value.trim() === "") {
    return yield* new MissingSteamCredentials({
      message: `${name} is missing or empty`,
    });
  }
  return value.value;
});

export class SteamCredentials extends Context.Service<
  SteamCredentials,
  {
    readonly get: Effect.Effect<
      { readonly username: string; readonly password: string },
      MissingSteamCredentials
    >;
  }
>()("@gimped/patch/SteamCredentials") {
  static readonly layerFromConfig: Layer.Layer<SteamCredentials> = Layer.succeed(SteamCredentials, {
    get: Effect.fn("SteamCredentials.get")(function* () {
      const username = yield* readSteamCredential("STEAM_USERNAME");
      const password = yield* readSteamCredential("STEAM_PASSWORD");
      return { username, password };
    })(),
  });
}
