import { Effect, Option } from "effect";
import { ConnectionHub, otherMemberIds } from "./connection-hub.ts";
import {
  customLobbyFrame,
  decodeAddBotRequest,
  decodeJoinCustomRoom,
  lobbyGuestJoinFrame,
  lobbyJoinFrame,
  parseUpdateSettings,
  settingsAckFromClient,
} from "./custom-lobby.ts";
import type { TcpFrame } from "./framing.ts";
import {
  applyAddBotRequest,
  applyLegendPickToState,
  applyLocalGuestJoin,
  applyUpdateSettings,
  nextGuestController,
} from "./lobby-state.ts";
import { decodeLegendPick } from "./legend-pick.ts";
import { PacketType } from "./packets.ts";
import { RoomRegistry, type Room } from "./room-registry.ts";

export type RoomFrameResult = {
  readonly replies: ReadonlyArray<TcpFrame>;
};

const lobbySnapshot = (room: Room, includeHeroSlots = false): TcpFrame =>
  customLobbyFrame(room.lobby, { roomId: room.roomId, includeHeroSlots });

const guestForMember = (room: Room, connectionId: number) => {
  const member = room.members.find((entry) => entry.connectionId === connectionId);
  if (member?.guestController === undefined) return undefined;
  return room.lobby.guests.find((guest) => guest.controller === member.guestController);
};

const joinerEnterFrames = (room: Room, connectionId: number): ReadonlyArray<TcpFrame> => {
  const guest = guestForMember(room, connectionId);
  if (guest === undefined) return [lobbySnapshot(room, true)];
  return [lobbyGuestJoinFrame(guest), lobbySnapshot(room, true)];
};

/** Room-scoped lobby packets (create/join/settings/seats/picks/bots). */
export const handleRoomFrame = Effect.fn("handleRoomFrame")(function* (
  frame: TcpFrame,
  connectionId: number,
): Effect.Effect<RoomFrameResult, never, RoomRegistry | ConnectionHub> {
  const registry = yield* RoomRegistry;
  const hub = yield* ConnectionHub;

  if (frame.type === PacketType.createCustomRoom) {
    const room = yield* registry.create(connectionId);
    return { replies: [lobbySnapshot(room)] };
  }

  if (frame.type === PacketType.joinCustomRoom) {
    try {
      const request = decodeJoinCustomRoom(frame.payload);
      const room = yield* registry
        .join(request.roomId, connectionId)
        .pipe(Effect.orElseSucceed(() => undefined));
      if (room === undefined) return { replies: [] };
      const frames = joinerEnterFrames(room, connectionId);
      yield* hub.broadcast(otherMemberIds(room.members, connectionId), frames);
      return { replies: frames };
    } catch {
      return { replies: [] };
    }
  }

  const current = yield* registry.roomForConnection(connectionId);
  if (Option.isNone(current)) return { replies: [] };
  const roomId = current.value.roomId;

  if (frame.type === PacketType.updateSettings) {
    try {
      const parsed = parseUpdateSettings(frame.payload);
      const room = yield* registry.updateLobby(roomId, (lobby) =>
        applyUpdateSettings(lobby, parsed),
      );
      const ack: TcpFrame = {
        type: PacketType.lobbySettings,
        seq: undefined,
        payload: settingsAckFromClient(frame.payload),
      };
      yield* hub.broadcast(otherMemberIds(room.members, connectionId), [lobbySnapshot(room, true)]);
      return { replies: [ack] };
    } catch {
      return { replies: [] };
    }
  }

  if (frame.type === PacketType.legendPick) {
    try {
      const pick = decodeLegendPick(frame.payload);
      yield* registry.updateLobby(roomId, (lobby) => applyLegendPickToState(lobby, pick));
      return { replies: [] };
    } catch {
      return { replies: [] };
    }
  }

  if (frame.type === PacketType.localJoin) {
    const before = current.value;
    const room = yield* registry.updateLobby(roomId, (lobby) =>
      applyLocalGuestJoin(lobby, nextGuestController(lobby)),
    );
    if (room.lobby.guests.length === before.lobby.guests.length) {
      const last = room.lobby.guests[room.lobby.guests.length - 1];
      if (last === undefined) return { replies: [] };
      return { replies: [lobbyGuestJoinFrame(last)] };
    }
    const guest = room.lobby.guests[room.lobby.guests.length - 1]!;
    const frames: TcpFrame[] = [lobbyGuestJoinFrame(guest), lobbySnapshot(room, true)];
    yield* hub.broadcast(otherMemberIds(room.members, connectionId), frames);
    return { replies: frames };
  }

  if (frame.type === PacketType.addBot) {
    try {
      const request = decodeAddBotRequest(frame.payload);
      if (!request.add) {
        const before = current.value;
        const room = yield* registry.updateLobby(roomId, (lobby) =>
          applyLocalGuestJoin(lobby, request.controller),
        );
        if (room.lobby.guests.length === before.lobby.guests.length) {
          const last = room.lobby.guests.find((guest) => guest.controller === request.controller);
          if (last === undefined) return { replies: [] };
          return { replies: [lobbyGuestJoinFrame(last)] };
        }
        const guest = room.lobby.guests.find((entry) => entry.controller === request.controller);
        if (guest === undefined) return { replies: [] };
        const frames: TcpFrame[] = [lobbyGuestJoinFrame(guest), lobbySnapshot(room, true)];
        yield* hub.broadcast(otherMemberIds(room.members, connectionId), frames);
        return { replies: frames };
      }
      const before = current.value;
      const room = yield* registry.updateLobby(roomId, (lobby) =>
        applyAddBotRequest(lobby, request),
      );
      if (room.lobby.bots.length === before.lobby.bots.length) return { replies: [] };
      const frames: TcpFrame[] = [lobbyJoinFrame(request.controller)];
      yield* hub.broadcast(otherMemberIds(room.members, connectionId), [
        ...frames,
        lobbySnapshot(room, true),
      ]);
      return { replies: frames };
    } catch {
      return { replies: [] };
    }
  }

  return { replies: [] };
});

export const isRoomPacket = (type: number): boolean =>
  type === PacketType.createCustomRoom ||
  type === PacketType.joinCustomRoom ||
  type === PacketType.updateSettings ||
  type === PacketType.legendPick ||
  type === PacketType.localJoin ||
  type === PacketType.addBot;
