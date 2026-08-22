import { describe, expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import { RoomRegistry } from "./room-registry.ts";

describe("RoomRegistry memory", () => {
  it.effect("isolates lobbies by room id", () =>
    Effect.gen(function* () {
      const registry = yield* RoomRegistry;
      const a = yield* registry.create(1);
      const b = yield* registry.create(2);
      expect(a.roomId).toBe(1);
      expect(b.roomId).toBe(2);
      yield* registry.updateLobby(a.roomId, (lobby) => ({ ...lobby, maxPlayers: 2 }));
      const roomA = yield* registry.roomForConnection(1);
      const roomB = yield* registry.roomForConnection(2);
      expect(Option.getOrThrow(roomA).lobby.maxPlayers).toBe(2);
      expect(Option.getOrThrow(roomB).lobby.maxPlayers).toBe(4);
    }).pipe(Effect.provide(RoomRegistry.layerMemory)),
  );

  it.effect("dissolve room when host leaves", () =>
    Effect.gen(function* () {
      const registry = yield* RoomRegistry;
      const room = yield* registry.create(1);
      yield* registry.join(room.roomId, 2);
      const after = yield* registry.leave(1);
      expect(Option.isNone(after)).toBe(true);
      expect(Option.isNone(yield* registry.roomForConnection(2))).toBe(true);
    }).pipe(Effect.provide(RoomRegistry.layerMemory)),
  );
});
