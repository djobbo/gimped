import { Context, Effect, Layer, Option, Ref, Schema } from "effect";
import {
  applyLocalGuestJoin,
  initialLobbyState,
  nextGuestController,
  type LobbyState,
} from "./lobby-state.ts";

export type RoomRole = "host" | "joiner";

export type RoomMember = {
  readonly connectionId: number;
  readonly role: RoomRole;
  /** Set for joiners — matches LobbyGuest.controller in the shared lobby. */
  readonly guestController: number | undefined;
};

export type Room = {
  readonly roomId: number;
  readonly lobby: LobbyState;
  readonly members: ReadonlyArray<RoomMember>;
};

export class RoomNotFound extends Schema.TaggedError<RoomNotFound>()("RoomNotFound", {
  roomId: Schema.Number,
}) {}

export class RoomFull extends Schema.TaggedError<RoomFull>()("RoomFull", {
  roomId: Schema.Number,
}) {}

export class AlreadyInRoom extends Schema.TaggedError<AlreadyInRoom>()("AlreadyInRoom", {
  connectionId: Schema.Number,
  roomId: Schema.Number,
}) {}

type RegistryState = {
  readonly nextRoomId: number;
  readonly rooms: ReadonlyMap<number, Room>;
  readonly connectionToRoom: ReadonlyMap<number, number>;
};

const emptyState = (): RegistryState => ({
  nextRoomId: 1,
  rooms: new Map(),
  connectionToRoom: new Map(),
});

const occupiedSeats = (lobby: LobbyState): number => 1 + lobby.guests.length + lobby.bots.length;

export class RoomRegistry extends Context.Service<
  RoomRegistry,
  {
    readonly create: (hostConnectionId: number) => Effect.Effect<Room>;
    readonly join: (
      roomId: number,
      connectionId: number,
    ) => Effect.Effect<Room, RoomNotFound | RoomFull | AlreadyInRoom>;
    readonly leave: (connectionId: number) => Effect.Effect<Option.Option<Room>>;
    readonly roomForConnection: (connectionId: number) => Effect.Effect<Option.Option<Room>>;
    readonly updateLobby: (
      roomId: number,
      update: (lobby: LobbyState) => LobbyState,
    ) => Effect.Effect<Room, RoomNotFound>;
  }
>()("@gimped/backend/RoomRegistry") {
  /** Process-local map — swap this layer for Redis/DB later without changing callers. */
  static readonly layerMemory: Layer.Layer<RoomRegistry> = Layer.effect(
    RoomRegistry,
    Effect.gen(function* () {
      const stateRef = yield* Ref.make(emptyState());

      const roomForConnection = Effect.fn("RoomRegistry.roomForConnection")(function* (
        connectionId: number,
      ) {
        const state = yield* Ref.get(stateRef);
        const roomId = state.connectionToRoom.get(connectionId);
        if (roomId === undefined) return Option.none<Room>();
        const room = state.rooms.get(roomId);
        return room === undefined ? Option.none<Room>() : Option.some(room);
      });

      const leave = Effect.fn("RoomRegistry.leave")(function* (connectionId: number) {
        return yield* Ref.modify(stateRef, (state) => {
          const roomId = state.connectionToRoom.get(connectionId);
          if (roomId === undefined) return [Option.none<Room>(), state] as const;
          const room = state.rooms.get(roomId);
          if (room === undefined) {
            const connectionToRoom = new Map(state.connectionToRoom);
            connectionToRoom.delete(connectionId);
            return [Option.none<Room>(), { ...state, connectionToRoom }] as const;
          }
          const leaving = room.members.find((member) => member.connectionId === connectionId);
          const hostLeft = leaving?.role === "host";
          const remaining = room.members.filter((member) => member.connectionId !== connectionId);
          const connectionToRoom = new Map(state.connectionToRoom);
          connectionToRoom.delete(connectionId);
          const rooms = new Map(state.rooms);
          if (hostLeft || remaining.length === 0) {
            for (const member of remaining) connectionToRoom.delete(member.connectionId);
            rooms.delete(roomId);
            return [Option.none<Room>(), { ...state, rooms, connectionToRoom }] as const;
          }
          let lobby = room.lobby;
          if (leaving?.guestController !== undefined) {
            lobby = {
              ...lobby,
              guests: lobby.guests.filter((guest) => guest.controller !== leaving.guestController),
            };
          }
          const nextRoom: Room = { ...room, lobby, members: remaining };
          rooms.set(roomId, nextRoom);
          return [Option.some(nextRoom), { ...state, rooms, connectionToRoom }] as const;
        });
      });

      const create = Effect.fn("RoomRegistry.create")(function* (hostConnectionId: number) {
        yield* leave(hostConnectionId);
        return yield* Ref.modify(stateRef, (state) => {
          const roomId = state.nextRoomId;
          const room: Room = {
            roomId,
            lobby: initialLobbyState(),
            members: [{ connectionId: hostConnectionId, role: "host", guestController: undefined }],
          };
          const rooms = new Map(state.rooms);
          rooms.set(roomId, room);
          const connectionToRoom = new Map(state.connectionToRoom);
          connectionToRoom.set(hostConnectionId, roomId);
          return [room, { nextRoomId: roomId + 1, rooms, connectionToRoom }] as const;
        });
      });

      const join = Effect.fn("RoomRegistry.join")(function* (roomId: number, connectionId: number) {
        const existing = yield* roomForConnection(connectionId);
        if (Option.isSome(existing)) {
          if (existing.value.roomId === roomId) return existing.value;
          return yield* new AlreadyInRoom({ connectionId, roomId: existing.value.roomId });
        }
        const state = yield* Ref.get(stateRef);
        const room = state.rooms.get(roomId);
        if (room === undefined) return yield* new RoomNotFound({ roomId });
        if (occupiedSeats(room.lobby) >= room.lobby.maxPlayers) {
          return yield* new RoomFull({ roomId });
        }
        const guestController = nextGuestController(room.lobby);
        const lobby = applyLocalGuestJoin(room.lobby, guestController);
        const nextRoom: Room = {
          ...room,
          lobby,
          members: [...room.members, { connectionId, role: "joiner", guestController }],
        };
        const rooms = new Map(state.rooms);
        rooms.set(roomId, nextRoom);
        const connectionToRoom = new Map(state.connectionToRoom);
        connectionToRoom.set(connectionId, roomId);
        yield* Ref.set(stateRef, { ...state, rooms, connectionToRoom });
        return nextRoom;
      });

      const updateLobby = Effect.fn("RoomRegistry.updateLobby")(function* (
        roomId: number,
        update: (lobby: LobbyState) => LobbyState,
      ) {
        const state = yield* Ref.get(stateRef);
        const room = state.rooms.get(roomId);
        if (room === undefined) return yield* new RoomNotFound({ roomId });
        const nextRoom: Room = { ...room, lobby: update(room.lobby) };
        const rooms = new Map(state.rooms);
        rooms.set(roomId, nextRoom);
        yield* Ref.set(stateRef, { ...state, rooms });
        return nextRoom;
      });

      return { create, join, leave, roomForConnection, updateLobby };
    }),
  );
}
