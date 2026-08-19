import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { BitWriter } from "./bitstream.ts";
import { encodeGameConnect } from "./game-connect.ts";
import { GameChildRuntime } from "./game-child-runtime.ts";
import { STUB_USER_ID } from "./login-accepted.ts";
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

  it.effect("drops to matchOver when the final player stock is lost", () =>
    Effect.gen(function* () {
      const runtime = yield* GameChildRuntime.make({ includeBot: false });
      yield* runtime.forceState({
        phase: "activeMatch",
        includeBot: false,
        connected: true,
        tick: 10,
        clientTick: 10,
        simReady: true,
        entities: [
          {
            entityId: 1,
            userId: STUB_USER_ID,
            stocks: 1,
            damage: 999,
            x: 12,
            y: 34,
          },
        ],
      });
      yield* runtime.tick();
      expect(yield* runtime.phase).toBe("matchOver");
    }),
  );

  it.effect("respawns the player when stocks remain", () =>
    Effect.gen(function* () {
      const runtime = yield* GameChildRuntime.make({ includeBot: false });
      yield* runtime.forceState({
        phase: "activeMatch",
        includeBot: false,
        connected: true,
        tick: 3,
        clientTick: 3,
        simReady: true,
        entities: [
          {
            entityId: 1,
            userId: STUB_USER_ID,
            stocks: 2,
            damage: 999,
            x: 120,
            y: 480,
          },
        ],
      });
      yield* runtime.tick();
      expect(yield* runtime.phase).toBe("activeMatch");
      const state = yield* runtime.state;
      expect(state.entities).toEqual([
        {
          entityId: 1,
          userId: STUB_USER_ID,
          stocks: 1,
          damage: 0,
          x: 0,
          y: 0,
        },
      ]);
    }),
  );

  it.effect("applies the same stock rules to the bot", () =>
    Effect.gen(function* () {
      const runtime = yield* GameChildRuntime.make({ includeBot: true });
      yield* runtime.forceState({
        phase: "activeMatch",
        includeBot: true,
        connected: true,
        tick: 7,
        clientTick: 7,
        simReady: true,
        entities: [
          {
            entityId: 1,
            userId: STUB_USER_ID,
            stocks: 3,
            damage: 0,
            x: 0,
            y: 0,
          },
          {
            entityId: 2,
            userId: 0,
            stocks: 2,
            damage: 999,
            x: 400,
            y: 220,
          },
        ],
      });
      yield* runtime.tick();
      const state = yield* runtime.state;
      expect(state.phase).toBe("activeMatch");
      expect(state.entities).toEqual([
        {
          entityId: 1,
          userId: STUB_USER_ID,
          stocks: 3,
          damage: 0,
          x: 0,
          y: 0,
        },
        {
          entityId: 2,
          userId: 0,
          stocks: 1,
          damage: 0,
          x: 0,
          y: 0,
        },
      ]);
    }),
  );
});
