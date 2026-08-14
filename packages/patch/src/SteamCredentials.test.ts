import { expect, layer } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import { MissingSteamCredentials } from "./errors.ts";
import { SteamCredentials } from "./SteamCredentials.ts";

const withConfig = (record: Record<string, string>) =>
  SteamCredentials.layerFromConfig.pipe(
    Layer.provideMerge(ConfigProvider.layer(ConfigProvider.fromUnknown(record))),
  );

layer(withConfig({ STEAM_USERNAME: "user", STEAM_PASSWORD: "pass" }))(
  "SteamCredentials.layerFromConfig",
  (it) => {
    it.effect("reads username and password", () =>
      Effect.gen(function* () {
        const steam = yield* SteamCredentials;
        const creds = yield* steam.get;
        expect(creds.username).toBe("user");
        expect(creds.password).toBe("pass");
      }),
    );
  },
);

layer(withConfig({}))("SteamCredentials missing", (it) => {
  it.effect("fails MissingSteamCredentials", () =>
    Effect.gen(function* () {
      const steam = yield* SteamCredentials;
      const result = yield* Effect.result(steam.get);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(MissingSteamCredentials);
      }
    }),
  );
});
