import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { GameListenReady, GameListenReadyLine, MatchSpec } from "./match-spec.ts";

describe("match spec schemas", () => {
  it("round-trips the ready JSON line", () => {
    const ready = new GameListenReady({ host: "127.0.0.1", tcpPort: 40000, udpPort: 40001 });
    const line = Schema.encodeUnknownSync(GameListenReadyLine)(ready);
    expect(Schema.decodeUnknownSync(GameListenReadyLine)(line)).toEqual(ready);
  });

  it("round-trips MatchSpec", () => {
    const spec = new MatchSpec({ userId: 1, token: "gimped", levelId: 1, includeBot: true });
    expect(Schema.decodeUnknownSync(MatchSpec)(Schema.encodeUnknownSync(MatchSpec)(spec))).toEqual(
      spec,
    );
  });
});
