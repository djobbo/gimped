import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";
import { BitWriter } from "./bitstream.ts";
import { ConnectionHub } from "./connection-hub.ts";
import { decodeCustomLobby } from "./custom-lobby.ts";
import { PacketType } from "./packets.ts";
import { handleRoomFrame } from "./room-replies.ts";
import { RoomRegistry } from "./room-registry.ts";

const freshRoomLayer = () => Layer.mergeAll(RoomRegistry.layerMemory, ConnectionHub.layerMemory);

describe("room registry replies", () => {
  it.effect("create allocates room id 1 and returns 2445", () =>
    Effect.gen(function* () {
      const result = yield* handleRoomFrame(
        {
          type: PacketType.createCustomRoom,
          seq: 0,
          payload: Uint8Array.from([0x1e, 0x00, 0x10, 0x20]),
        },
        1,
      );
      expect(result.replies).toHaveLength(1);
      expect(result.replies[0]?.type).toBe(PacketType.customLobby);
      expect(decodeCustomLobby(result.replies[0]!.payload).roomId).toBe(1);
    }).pipe(Effect.provide(freshRoomLayer())),
  );

  it.effect("second create gets room id 2 (multi-lobby)", () =>
    Effect.gen(function* () {
      yield* handleRoomFrame(
        { type: PacketType.createCustomRoom, seq: 0, payload: new Uint8Array() },
        1,
      );
      const second = yield* handleRoomFrame(
        { type: PacketType.createCustomRoom, seq: 0, payload: new Uint8Array() },
        2,
      );
      expect(decodeCustomLobby(second.replies[0]!.payload).roomId).toBe(2);
    }).pipe(Effect.provide(freshRoomLayer())),
  );

  it.effect("join attaches to host lobby and fans out to host", () =>
    Effect.gen(function* () {
      const hub = yield* ConnectionHub;
      const hostFrames: number[] = [];
      yield* hub.register(1, () =>
        Effect.sync(() => {
          hostFrames.push(1);
        }),
      );
      yield* handleRoomFrame(
        { type: PacketType.createCustomRoom, seq: 0, payload: new Uint8Array() },
        1,
      );
      const bits = new BitWriter();
      bits.writePackedU32(1);
      bits.writeBool(false);
      bits.writeBool(true);
      const joined = yield* handleRoomFrame(
        { type: PacketType.joinCustomRoom, seq: 0, payload: bits.toUint8Array() },
        2,
      );
      expect(joined.replies.map((frame) => frame.type)).toEqual([
        PacketType.lobbyJoin,
        PacketType.customLobby,
      ]);
      expect(decodeCustomLobby(joined.replies[1]!.payload).roomId).toBe(1);
      expect(hostFrames.length).toBeGreaterThan(0);
      const registry = yield* RoomRegistry;
      const room = yield* registry.roomForConnection(2);
      expect(Option.isSome(room)).toBe(true);
      if (Option.isSome(room)) {
        expect(room.value.lobby.guests).toHaveLength(1);
        expect(room.value.members).toHaveLength(2);
      }
    }).pipe(Effect.provide(freshRoomLayer())),
  );

  it.effect("join unknown room returns no replies", () =>
    Effect.gen(function* () {
      const bits = new BitWriter();
      bits.writePackedU32(99);
      bits.writeBool(false);
      bits.writeBool(true);
      const result = yield* handleRoomFrame(
        { type: PacketType.joinCustomRoom, seq: 0, payload: bits.toUint8Array() },
        1,
      );
      expect(result.replies).toEqual([]);
    }).pipe(Effect.provide(freshRoomLayer())),
  );

  it.effect("settings update is shared across members", () =>
    Effect.gen(function* () {
      const registry = yield* RoomRegistry;
      yield* handleRoomFrame(
        { type: PacketType.createCustomRoom, seq: 0, payload: new Uint8Array() },
        1,
      );
      const bits = new BitWriter();
      bits.writePackedU32(1);
      bits.writeBool(false);
      bits.writeBool(true);
      yield* handleRoomFrame(
        { type: PacketType.joinCustomRoom, seq: 0, payload: bits.toUint8Array() },
        2,
      );
      const settings = Uint8Array.from(
        Buffer.from("001100287680000806c86c8084080000000000223a4a698800", "hex"),
      );
      yield* handleRoomFrame({ type: PacketType.updateSettings, seq: 0, payload: settings }, 1);
      const room = yield* registry.roomForConnection(2);
      expect(Option.isSome(room)).toBe(true);
      if (Option.isSome(room)) {
        expect(room.value.lobby.maxPlayers).toBe(2);
      }
    }).pipe(Effect.provide(freshRoomLayer())),
  );
});
