import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { encodeGameConnect } from "./game-connect.ts";
import { GameChildRuntime } from "./game-child-runtime.ts";
import { PacketType } from "./packets.ts";

describe("game child runtime", () => {
  it.effect("starts in waitingForConnect and moves to syncingIntoMatch on connect", () =>
    Effect.gen(function* () {
      const runtime = yield* GameChildRuntime.make({ includeBot: false });
      expect(yield* runtime.phase).toBe("waitingForConnect");
      yield* runtime.connect();
      expect(yield* runtime.phase).toBe("syncingIntoMatch");
    }),
  );

  it.effect("increments tick on each tick call", () =>
    Effect.gen(function* () {
      const runtime = yield* GameChildRuntime.make({ includeBot: false });
      yield* runtime.connect();
      expect(yield* runtime.tick()).toEqual([]);
      expect(yield* runtime.tick()).toEqual([]);
    }),
  );

  it.effect("marks shouldClose after ingest close action", () =>
    Effect.gen(function* () {
      const runtime = yield* GameChildRuntime.make({
        includeBot: false,
        userId: 1,
        token: "gimped",
      });
      yield* runtime.connect();
      expect(yield* runtime.shouldClose).toBe(false);
      yield* runtime.ingest({
        type: PacketType.gameConnect,
        seq: undefined,
        payload: encodeGameConnect({ userId: 1, token: "nope" }),
      });
      expect(yield* runtime.shouldClose).toBe(true);
    }),
  );
});
