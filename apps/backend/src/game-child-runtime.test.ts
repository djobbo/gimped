import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { BitWriter } from "./bitstream.ts";
import { encodeGameConnect } from "./game-connect.ts";
import { GameChildRuntime } from "./game-child-runtime.ts";
import { STUB_USER_ID } from "./login-accepted.ts";
import { PacketType } from "./packets.ts";
import { decodeUdpTunnel, encodeUdpTunnel } from "./game-udp-tunnel.ts";
import { decodeUdpDatagram, encodeUdpDatagram, STUB_UDP_CHANNEL } from "./game-udp-datagram.ts";

describe("game child runtime", () => {
  it.effect("starts in waitingForConnect and moves to syncingIntoMatch on connect", () =>
    Effect.gen(function* () {
      const runtime = yield* GameChildRuntime.make({ includeBot: false });
      expect(yield* runtime.phase).toBe("waitingForConnect");
      yield* runtime.connect();
      expect(yield* runtime.phase).toBe("syncingIntoMatch");
    }),
  );

  it.effect("does not emit bare TCP pulses (10316 tunnel drives sync)", () =>
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

  it.effect("does not tick until client sim reaches fight phase", () =>
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
      yield* runtime.ingest({
        type: PacketType.postConnectAck,
        seq: undefined,
        payload: new Uint8Array(),
      });
      expect(yield* runtime.phase).toBe("activeMatch");
      expect(yield* runtime.state).toMatchObject({ simReady: false, tick: 0 });
      yield* runtime.forceState({
        ...(yield* runtime.state),
        clientSimTick: 4800,
        lastIntroSyncAtMs: Date.now() - 600,
      });
      expect(yield* runtime.tick()).toEqual([]);
    }),
  );

  it.effect("does not start tick loop on intro-phase UDP input", () =>
    Effect.gen(function* () {
      const runtime = yield* GameChildRuntime.make({ includeBot: true, userId: 1 });
      yield* runtime.forceState({
        phase: "activeMatch",
        includeBot: true,
        connected: true,
        tick: 0,
        clientTick: 0,
        clientSimTick: 0,
        simReady: false,
        entityInputs: {},
        inputQueue: [],
        udpAckSeq: 0,
        udpSendSeq: 0,
        udpSessionId: 1,
        lastIntroSyncAtMs: Date.now(),
        lastTickAdvanceAtMs: 0,
        enteredActiveMatchAtMs: 0,
        entities: [
          {
            entityId: 1,
            userId: STUB_USER_ID,
            stocks: 3,
            damage: 0,
            x: 0,
            y: 0,
          },
        ],
      });
      const writer = new BitWriter();
      writer.writeBits(4, 1);
      writer.writePackedU32(368);
      writer.writeBits(14, 128);
      const datagramPayload = encodeUdpDatagram({
        sessionId: 1,
        channel: STUB_UDP_CHANNEL,
        seqStart: 1,
        packets: [{ type: PacketType.moveInput, payload: writer.toUint8Array() }],
      });
      yield* runtime.ingestUdp(datagramPayload);
      const pending = yield* runtime.drainPendingTcp();
      expect(pending).toEqual([]);
      expect(yield* runtime.state).toMatchObject({
        simReady: false,
        tick: 0,
        clientSimTick: 368,
      });
    }),
  );

  it.effect("sends 10404 after intro quiet when client sim reaches fight phase", () =>
    Effect.gen(function* () {
      const runtime = yield* GameChildRuntime.make({ includeBot: false, userId: 1 });
      yield* runtime.connect();
      yield* runtime.ingest({
        type: PacketType.gameConnect,
        seq: undefined,
        payload: encodeGameConnect({ userId: 1, token: "gimped" }),
      });
      yield* runtime.ingest({
        type: PacketType.postConnectAck,
        seq: undefined,
        payload: new Uint8Array(),
      });
      const introWriter = new BitWriter();
      introWriter.writeBool(true);
      introWriter.writePackedU32(6608);
      yield* runtime.ingest({
        type: PacketType.introEntitySync,
        seq: undefined,
        payload: introWriter.toUint8Array(),
      });
      expect(yield* runtime.tick()).toEqual([]);
      yield* runtime.forceState({
        ...(yield* runtime.state),
        lastIntroSyncAtMs: Date.now() - 600,
      });
      const tickFrames = yield* runtime.tick();
      expect(tickFrames.map((frame) => frame.type)).toEqual([PacketType.tickAck]);
      expect(yield* runtime.state).toMatchObject({ tick: 6608, simReady: true });
    }),
  );

  it.effect("starts fight from move-input sim tick when client never sends intro sync", () =>
    Effect.gen(function* () {
      const runtime = yield* GameChildRuntime.make({ includeBot: true, userId: 1 });
      yield* runtime.forceState({
        phase: "activeMatch",
        includeBot: true,
        connected: true,
        tick: 0,
        clientTick: 0,
        clientSimTick: 6336,
        simReady: false,
        entityInputs: {},
        inputQueue: [],
        udpAckSeq: 0,
        udpSendSeq: 0,
        udpSessionId: 1,
        lastIntroSyncAtMs: 0,
        lastTickAdvanceAtMs: 0,
        enteredActiveMatchAtMs: Date.now(),
        entities: [
          {
            entityId: 1,
            userId: STUB_USER_ID,
            stocks: 3,
            damage: 0,
            x: 0,
            y: 0,
          },
        ],
      });
      const tickFrames = yield* runtime.tick();
      expect(tickFrames.map((frame) => frame.type)).toEqual([PacketType.tickAck]);
      expect(yield* runtime.state).toMatchObject({ tick: 6336, simReady: true });
    }),
  );

  it.effect("starts fight when client sim tick reaches fight phase and intro is quiet", () =>
    Effect.gen(function* () {
      const runtime = yield* GameChildRuntime.make({ includeBot: true, userId: 1 });
      yield* runtime.forceState({
        phase: "activeMatch",
        includeBot: true,
        connected: true,
        tick: 0,
        clientTick: 0,
        clientSimTick: 6608,
        simReady: false,
        entityInputs: {},
        inputQueue: [],
        udpAckSeq: 0,
        udpSendSeq: 0,
        udpSessionId: 1,
        lastIntroSyncAtMs: Date.now() - 600,
        lastTickAdvanceAtMs: 0,
        enteredActiveMatchAtMs: Date.now(),
        entities: [
          {
            entityId: 1,
            userId: STUB_USER_ID,
            stocks: 3,
            damage: 0,
            x: 0,
            y: 0,
          },
        ],
      });
      const tickFrames = yield* runtime.tick();
      expect(tickFrames.map((frame) => frame.type)).toEqual([PacketType.tickAck]);
      expect(yield* runtime.state).toMatchObject({ tick: 6608, simReady: true });
    }),
  );

  it.effect("ignores client 10301 echoes (server drives tick on wall clock)", () =>
    Effect.gen(function* () {
      const runtime = yield* GameChildRuntime.make({ includeBot: true });
      yield* runtime.forceState({
        phase: "activeMatch",
        includeBot: true,
        connected: true,
        tick: 16,
        clientTick: 16,
        clientSimTick: 16,
        simReady: true,
        entityInputs: {},
        inputQueue: [],
        udpAckSeq: 0,
        udpSendSeq: 0,
        udpSessionId: 1,
        lastIntroSyncAtMs: Date.now(),
        lastTickAdvanceAtMs: Date.now(),
        enteredActiveMatchAtMs: Date.now(),
        entities: [
          {
            entityId: 1,
            userId: STUB_USER_ID,
            stocks: 3,
            damage: 0,
            x: 0,
            y: 0,
          },
        ],
      });
      const frames = yield* runtime.ingest({
        type: PacketType.tickPulse,
        seq: undefined,
        payload: new Uint8Array(),
      });
      expect(frames).toEqual([]);
      expect(yield* runtime.state).toMatchObject({ tick: 16 });
    }),
  );

  it.effect("advances tick on wall-clock loop and emits sync frames", () =>
    Effect.gen(function* () {
      const runtime = yield* GameChildRuntime.make({ includeBot: true });
      yield* runtime.forceState({
        phase: "activeMatch",
        includeBot: true,
        connected: true,
        tick: 16,
        clientTick: 16,
        clientSimTick: 32,
        simReady: true,
        entityInputs: {},
        inputQueue: [],
        udpAckSeq: 0,
        udpSendSeq: 0,
        udpSessionId: 1,
        lastIntroSyncAtMs: Date.now(),
        lastTickAdvanceAtMs: 0,
        enteredActiveMatchAtMs: 0,
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
            stocks: 3,
            damage: 0,
            x: 0,
            y: 0,
          },
        ],
      });
      const frames = yield* runtime.tick();
      expect(frames).toHaveLength(2);
      expect(frames[0]?.type).toBe(PacketType.tickPulse);
      expect(frames[1]?.type).toBe(PacketType.inputBroadcast);
      const state = yield* runtime.state;
      expect(state.tick).toBe(32);
    }),
  );

  it.effect("includes 10309 on wall-clock tick when move inputs are buffered", () =>
    Effect.gen(function* () {
      const runtime = yield* GameChildRuntime.make({ includeBot: true });
      yield* runtime.forceState({
        phase: "activeMatch",
        includeBot: true,
        connected: true,
        tick: 16,
        clientTick: 16,
        clientSimTick: 32,
        simReady: true,
        entityInputs: { 1: { tick: 32, input: 42 } },
        inputQueue: [{ entityId: 1, tick: 32, input: 42 }],
        udpAckSeq: 0,
        udpSendSeq: 0,
        udpSessionId: 1,
        lastIntroSyncAtMs: Date.now(),
        lastTickAdvanceAtMs: 0,
        enteredActiveMatchAtMs: 0,
        entities: [
          {
            entityId: 1,
            userId: STUB_USER_ID,
            stocks: 3,
            damage: 0,
            x: 0,
            y: 0,
          },
        ],
      });
      const frames = yield* runtime.tick();
      expect(frames).toHaveLength(2);
      expect(frames[1]?.type).toBe(PacketType.inputBroadcast);
    }),
  );

  it.effect("replies to gameplay UDP with ack only (inputs relay on TCP tick)", () =>
    Effect.gen(function* () {
      const runtime = yield* GameChildRuntime.make({ includeBot: true, userId: 1 });
      yield* runtime.forceState({
        phase: "activeMatch",
        includeBot: true,
        connected: true,
        tick: 16,
        clientTick: 16,
        clientSimTick: 16,
        simReady: true,
        entityInputs: {},
        inputQueue: [],
        udpAckSeq: 0,
        udpSendSeq: 0,
        udpSessionId: 1,
        lastIntroSyncAtMs: Date.now(),
        lastTickAdvanceAtMs: Date.now(),
        enteredActiveMatchAtMs: Date.now(),
        entities: [
          {
            entityId: 1,
            userId: STUB_USER_ID,
            stocks: 3,
            damage: 0,
            x: 0,
            y: 0,
          },
        ],
      });
      const writer = new BitWriter();
      writer.writeBits(4, 1);
      writer.writePackedU32(16);
      writer.writeBits(14, 4);
      const movePayload = writer.toUint8Array();
      const datagramPayload = encodeUdpDatagram({
        sessionId: 1,
        channel: STUB_UDP_CHANNEL,
        seqStart: 1,
        packets: [{ type: PacketType.moveInput, payload: movePayload }],
      });
      const reply = yield* runtime.ingestUdp(datagramPayload);
      expect(reply).toBeDefined();
      const decoded = decodeUdpDatagram(reply!);
      expect(decoded?.packets.map((packet) => packet.type)).toEqual([10]);
      const pending = yield* runtime.drainPendingTcp();
      expect(pending.map((frame) => frame.type)).toEqual([
        PacketType.tickPulse,
        PacketType.inputBroadcast,
      ]);
      const state = yield* runtime.state;
      expect(state.tick).toBe(16);
      expect(state.inputQueue).toHaveLength(0);
    }),
  );

  it.effect("replies to 10316 udpTunnel with ack only", () =>
    Effect.gen(function* () {
      const runtime = yield* GameChildRuntime.make({ includeBot: true });
      yield* runtime.connect();
      yield* runtime.ingest({
        type: PacketType.postConnectAck,
        seq: undefined,
        payload: new Uint8Array(),
      });
      const writer = new BitWriter();
      writer.writeBits(4, 1);
      writer.writePackedU32(16);
      writer.writeBits(14, 4);
      const movePayload = writer.toUint8Array();
      const tunnelPayload = encodeUdpTunnel({
        ackSeq: 1,
        seqStart: 1,
        packets: [{ type: PacketType.moveInput, payload: movePayload }],
      });
      const frames = yield* runtime.ingest({
        type: PacketType.udpTunnel,
        seq: undefined,
        payload: tunnelPayload,
      });
      expect(frames).toHaveLength(1);
      expect(frames[0]?.type).toBe(PacketType.udpTunnel);
      const reply = decodeUdpTunnel(frames[0]!.payload);
      expect(reply?.packets.map((packet) => packet.type)).toEqual([10]);
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
        clientSimTick: 10,
        simReady: true,
        entityInputs: {},
        inputQueue: [],
        udpAckSeq: 0,
        udpSendSeq: 0,
        udpSessionId: 1,
        lastIntroSyncAtMs: Date.now(),
        lastTickAdvanceAtMs: Date.now(),
        enteredActiveMatchAtMs: Date.now(),
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
        clientSimTick: 3,
        simReady: true,
        entityInputs: {},
        inputQueue: [],
        udpAckSeq: 0,
        udpSendSeq: 0,
        udpSessionId: 1,
        lastIntroSyncAtMs: Date.now(),
        lastTickAdvanceAtMs: Date.now(),
        enteredActiveMatchAtMs: Date.now(),
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
        clientSimTick: 7,
        simReady: true,
        entityInputs: {},
        inputQueue: [],
        udpAckSeq: 0,
        udpSendSeq: 0,
        udpSessionId: 1,
        lastIntroSyncAtMs: Date.now(),
        lastTickAdvanceAtMs: Date.now(),
        enteredActiveMatchAtMs: Date.now(),
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
