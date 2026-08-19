import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { BitWriter } from "./bitstream.ts";
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

  it.effect("emits tick pulse during activeMatch after simReady", () =>
    Effect.gen(function* () {
      const runtime = yield* GameChildRuntime.make({ includeBot: false });
      yield* runtime.connect();
      expect(yield* runtime.tick()).toEqual([]);
      yield* runtime.ingest({
        type: PacketType.postConnectAck,
        seq: undefined,
        payload: new Uint8Array(),
      });
      yield* runtime.ingest({
        type: PacketType.simReady,
        seq: undefined,
        payload: new Uint8Array(),
      });
      const frames = yield* runtime.tick();
      expect(frames.map((frame) => frame.type)).toEqual([
        PacketType.tickPulse,
        PacketType.entityValue,
      ]);
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

  it.effect("moves to activeMatch after 10403 post-connect ack", () =>
    Effect.gen(function* () {
      const runtime = yield* GameChildRuntime.make({
        includeBot: false,
        userId: 1,
        token: "gimped",
      });
      yield* runtime.connect();
      yield* runtime.ingest({
        type: PacketType.gameConnect,
        seq: undefined,
        payload: encodeGameConnect({ userId: 1, token: "gimped" }),
      });
      expect(yield* runtime.phase).toBe("syncingIntoMatch");
      yield* runtime.ingest({
        type: PacketType.postConnectAck,
        seq: undefined,
        payload: new Uint8Array(),
      });
      expect(yield* runtime.phase).toBe("activeMatch");
    }),
  );

  it.effect("applyInput updates entity position on move", () =>
    Effect.gen(function* () {
      const runtime = yield* GameChildRuntime.make({ includeBot: false });
      yield* runtime.connect();
      yield* runtime.ingest({
        type: PacketType.postConnectAck,
        seq: undefined,
        payload: new Uint8Array(),
      });
      yield* runtime.ingest({
        type: PacketType.simReady,
        seq: undefined,
        payload: new Uint8Array(),
      });
      const writer = new BitWriter();
      writer.writeBits(4, 1);
      writer.writePackedU32(900);
      writer.writeBits(14, 250);
      yield* runtime.ingest({
        type: PacketType.moveInput,
        seq: undefined,
        payload: writer.toUint8Array(),
      });
      const frames = yield* runtime.tick();
      expect(frames[1]?.type).toBe(PacketType.entityValue);
    }),
  );
});
