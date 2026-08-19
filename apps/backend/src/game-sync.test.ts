import { describe, expect, it } from "@effect/vitest";
import {
  buildInitialSync,
  decodeEntitySpawn,
  decodeGameServerReady,
  decodeSessionSync,
  encodeEntitySpawn,
  encodeGameServerReady,
  encodeSessionSync,
} from "./game-sync.ts";
import { PacketType } from "./packets.ts";

describe("game sync", () => {
  it("emits the exact required post-10310 sync sequence", () => {
    const frames = buildInitialSync(
      {
        phase: "syncingIntoMatch",
        includeBot: false,
        connected: true,
        tick: 0,
        entities: [],
      },
      { sessionToken: "gimped" },
    );
    expect(frames.map((frame) => frame.type)).toEqual([
      PacketType.sessionSync,
      PacketType.entitySpawn,
      PacketType.gameServerReady,
    ]);
  });

  it("includes a bot entity when includeBot is true", () => {
    const frames = buildInitialSync(
      {
        phase: "syncingIntoMatch",
        includeBot: true,
        connected: true,
        tick: 0,
        entities: [],
      },
      { sessionToken: "gimped" },
    );
    const spawn = decodeEntitySpawn(frames[1]!.payload);
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
});
