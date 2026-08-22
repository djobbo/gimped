import { describe, expect, it } from "@effect/vitest";
import {
  buildInitialSync,
  buildLevelReadySync,
  buildQuitSync,
  decodeEntitySpawn,
  decodeGameServerReady,
  decodeSessionSync,
  encodeEntitySpawn,
  encodeGameServerReady,
  encodeSessionSync,
} from "./game-sync.ts";
import { PacketType } from "./packets.ts";

describe("game sync", () => {
  it("emits no frames immediately after match setup", () => {
    const frames = buildInitialSync(
      {
        phase: "syncingIntoMatch",
        includeBot: false,
        connected: true,
        tick: 0,
        clientTick: 0,
        clientSimTick: 0,
        simReady: false,
        entities: [],
        entityInputs: {},
        inputQueue: [],
        udpAckSeq: 0,
        udpSendSeq: 0,
        udpSessionId: 1,
        lastIntroSyncAtMs: 0,
        lastTickAdvanceAtMs: 0,
        enteredActiveMatchAtMs: 0,
      },
      { sessionToken: "gimped" },
    );
    expect(frames).toEqual([]);
  });

  it("emits game-server ready after level ready (not 10311/10312 — they clear fighters)", () => {
    const frames = buildLevelReadySync(
      {
        phase: "syncingIntoMatch",
        includeBot: false,
        connected: true,
        tick: 0,
        clientTick: 0,
        clientSimTick: 0,
        simReady: false,
        entities: [],
        entityInputs: {},
        inputQueue: [],
        udpAckSeq: 0,
        udpSendSeq: 0,
        udpSessionId: 1,
        lastIntroSyncAtMs: 0,
        lastTickAdvanceAtMs: 0,
        enteredActiveMatchAtMs: 0,
      },
      { sessionToken: "gimped" },
    );
    expect(frames.map((frame) => frame.type)).toEqual([PacketType.gameServerReady]);
    expect(decodeGameServerReady(frames[0]!.payload)).toEqual({
      _tag: "GameServerReady",
      ready: true,
      tick: 0,
    });
  });

  it("encodeEntitySpawn includes a bot entity when requested", () => {
    const payload = encodeEntitySpawn({
      entities: [
        { entityId: 1, name: "Gimped", userId: 1 },
        { entityId: 2, name: "Bot", userId: 0 },
      ],
    });
    const spawn = decodeEntitySpawn(payload);
    expect(spawn.entities).toHaveLength(2);
    expect(spawn.entities[1]?.name).toBe("Bot");
  });

  it("round-trips session sync (method_8595)", () => {
    const payload = encodeSessionSync({ clearTransfer: true, token: "gimped" });
    expect(decodeSessionSync(payload)).toEqual({
      _tag: "SessionSync",
      clearTransfer: true,
      token: "gimped",
    });
  });

  it("round-trips entity spawn (method_289)", () => {
    const payload = encodeEntitySpawn({
      entities: [{ entityId: 1, name: "Gimped", userId: 1 }],
    });
    expect(decodeEntitySpawn(payload)).toEqual({
      _tag: "EntitySpawn",
      entities: [
        {
          entityId: 1,
          field2: 0,
          name: "Gimped",
          field4: "",
          field5: 3,
          userId: 1,
          field7: 0,
          field8: false,
        },
      ],
    });
  });

  it("round-trips game server ready (method_4718)", () => {
    const payload = encodeGameServerReady({ ready: true, tick: 42 });
    expect(decodeGameServerReady(payload)).toEqual({
      _tag: "GameServerReady",
      ready: true,
      tick: 42,
    });
  });

  it("quit sync is 10312 scoreboard/EndMatch, not 12002", () => {
    const frames = buildQuitSync({
      phase: "activeMatch",
      includeBot: false,
      connected: true,
      tick: 16,
      clientTick: 16,
      clientSimTick: 16,
      simReady: true,
      entities: [{ entityId: 1, userId: 1, stocks: 3, damage: 0, x: 0, y: 0 }],
      entityInputs: {},
      inputQueue: [],
      udpAckSeq: 0,
      udpSendSeq: 0,
      udpSessionId: 1,
      lastIntroSyncAtMs: 0,
      lastTickAdvanceAtMs: 0,
      enteredActiveMatchAtMs: 0,
      disconnectedUserIds: [],
    });
    expect(frames.map((frame) => frame.type)).toEqual([PacketType.entitySpawn]);
    expect(decodeEntitySpawn(frames[0]!.payload)).toEqual({
      _tag: "EntitySpawn",
      entities: [
        {
          entityId: 1,
          field2: 0,
          name: "Gimped",
          field4: "",
          field5: 1,
          userId: 1,
          field7: 1,
          field8: false,
        },
      ],
    });
  });
});
