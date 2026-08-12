import { runWith } from "@gimped/common";
import { Effect, FileSystem, Path } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Envelope } from "./Envelope.ts";
import { TestLive } from "./layers.ts";
import { decode, encode } from "./ReplayCodec.ts";

const FIXTURES = [
  "[10.09] MishimaDojo (7).replay",
  "[10.09] WesternAirTemple (10).replay",
] as const;

const run = runWith(TestLive);

const readFixture = Effect.fn("readFixture")(function* (name: (typeof FIXTURES)[number]) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const here = yield* path.fromFileUrl(new URL(import.meta.url));
  return yield* fs.readFile(path.join(path.dirname(here), "..", "fixtures", name));
});

describe("real replay fixtures", () => {
  it.each(FIXTURES)("decompiles %s", async (name) => {
    const replay = await run(
      Effect.gen(function* () {
        const envelope = yield* Envelope;
        const bytes = yield* readFixture(name);
        const opened = yield* envelope.open(bytes);
        return yield* decode(opened);
      }),
    );
    expect(replay.replayVersion).toBeGreaterThan(0);
    expect(replay.players.length).toBeGreaterThan(0);
    expect(replay.heroSlotCount).toBeGreaterThan(0);
  });

  it.each(FIXTURES)("round-trips %s through encode/decode without names", async (name) => {
    const { original, roundTrip } = await run(
      Effect.gen(function* () {
        const envelope = yield* Envelope;
        const bytes = yield* readFixture(name);
        const original = yield* decode(yield* envelope.open(bytes));
        const rebuilt = yield* envelope.seal(yield* encode(original));
        const roundTrip = yield* decode(yield* envelope.open(rebuilt));
        return { original, roundTrip };
      }),
    );
    expect(roundTrip).toEqual(original);
    expect(original.players[0]?.heroes[0]?.heroName).toBeUndefined();
  });
});
