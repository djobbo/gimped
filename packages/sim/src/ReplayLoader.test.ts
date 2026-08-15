import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { IoError } from "@gimped/common";
import { encode, Envelope, ReplayCodec } from "@gimped/replay";
import { Effect, Layer } from "effect";
import { replay1v1 } from "./fixtures.ts";
import { ReplayLoader } from "./ReplayLoader.ts";

const Live = ReplayLoader.layer.pipe(
  Layer.provideMerge(Envelope.layer),
  Layer.provideMerge(ReplayCodec.layer),
  Layer.provideMerge(NodeServices.layer),
);

layer(Live)("ReplayLoader", (it) => {
  it.effect("fromBytes round-trips replay1v1", () =>
    Effect.gen(function* () {
      const loader = yield* ReplayLoader;
      const bytes = yield* encode(replay1v1());
      const replay = yield* loader.fromBytes(bytes);
      expect(replay.players.length).toBe(2);
      expect(replay.rules.scoringTypeId).toBe(1);
    }),
  );

  it.effect("fromPath missing file fails IoError", () =>
    Effect.gen(function* () {
      const loader = yield* ReplayLoader;
      const error = yield* loader.fromPath("/this/sim-replay/does/not/exist").pipe(Effect.flip);
      expect(error).toBeInstanceOf(IoError);
    }),
  );
});
