import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";
import { MatchSpecParseError } from "./errors.ts";
import {
  GameListenReady,
  GameListenReadyLine,
  MatchSetupSpec,
  MatchSpec,
  decodeSetupArgEffect,
  encodeSetupArg,
} from "./match-spec.ts";

describe("match spec schemas", () => {
  it("round-trips the ready JSON line", () => {
    const ready = new GameListenReady({ host: "127.0.0.1", tcpPort: 40000, udpPort: 40001 });
    const line = Schema.encodeUnknownSync(GameListenReadyLine)(ready);
    expect(Schema.decodeUnknownSync(GameListenReadyLine)(line)).toEqual(ready);
  });

  it("round-trips MatchSpec", () => {
    const spec = new MatchSpec({
      userId: 1,
      token: "gimped",
      levelId: 1,
      setup: new MatchSetupSpec({
        ...MatchSetupSpec.default,
        hostHeroId: 58,
        hostCostumeId: 120,
        hostHeroSlots: [
          { heroId: 58, costumeId: 120 },
          { heroId: 58, costumeId: 120 },
        ],
        bots: [{ controller: 5, entityId: 2, heroId: 3, costumeId: 3 }],
        guests: [],
      }),
    });
    expect(Schema.decodeUnknownSync(MatchSpec)(Schema.encodeUnknownSync(MatchSpec)(spec))).toEqual(
      spec,
    );
  });

  it("decodes setup with Effect helper", () => {
    const encoded = encodeSetupArg(MatchSetupSpec.default);
    const exit = Effect.runSyncExit(decodeSetupArgEffect(encoded));
    expect(exit).toEqual(Exit.succeed(MatchSetupSpec.default));
  });

  it.effect("maps setup decode failures to MatchSpecParseError", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(decodeSetupArgEffect("{oops"));
      expect(error).toBeInstanceOf(MatchSpecParseError);
    }),
  );
});
