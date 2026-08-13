import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";
import { Envelope } from "./Envelope.ts";
import { TestLive } from "./layers.ts";
import { decode, encode } from "./ReplayCodec.ts";

const FIXTURES = [
  "[10.09] MishimaDojo (7).replay",
  "[10.09] WesternAirTemple (10).replay",
] as const;

const readFixture = Effect.fn("readFixture")(function* (name: (typeof FIXTURES)[number]) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const here = yield* path.fromFileUrl(new URL(import.meta.url));
  return yield* fs.readFile(path.join(path.dirname(here), "..", "fixtures", name));
});

layer(TestLive)("real replay fixtures", (it) => {
  it.effect.each(FIXTURES)("decompiles %s", (name) =>
    Effect.gen(function* () {
      const envelope = yield* Envelope;
      const bytes = yield* readFixture(name);
      const opened = yield* envelope.open(bytes);
      const replay = yield* decode(opened);
      expect(replay.replayVersion).toBeGreaterThan(0);
      expect(replay.players.length).toBeGreaterThan(0);
      expect(replay.heroSlotCount).toBeGreaterThan(0);
    }),
  );

  it.effect.each(FIXTURES)("round-trips %s through encode/decode without names", (name) =>
    Effect.gen(function* () {
      const envelope = yield* Envelope;
      const bytes = yield* readFixture(name);
      const original = yield* decode(yield* envelope.open(bytes));
      const rebuilt = yield* envelope.seal(yield* encode(original));
      const roundTrip = yield* decode(yield* envelope.open(rebuilt));
      expect(roundTrip).toEqual(original);
      expect(original.players[0]?.heroes[0]?.heroName).toBeUndefined();
    }),
  );
});
