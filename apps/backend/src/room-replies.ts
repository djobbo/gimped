import { Effect, Match, Option } from "effect";
import { ConnectionHub, otherMemberIds } from "./connection-hub.ts";
import {
  customLobbyFrame,
  decodeAddBotRequest,
  decodeJoinCustomRoom,
  lobbyGuestJoinFrame,
  lobbyJoinFrame,
  parseUpdateSettings,
  recvLeaveFrame,
  settingsAckFromClient,
  spectateLeaveSelfFrame,
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
import { STUB_USER_ID } from "./login-accepted.ts";
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

const emptyReplies: RoomFrameResult = { replies: [] };

/** Room-scoped lobby packets (create/join/settings/seats/picks/bots). */
export const handleRoomFrame = Effect.fn("handleRoomFrame")(function* (
  frame: TcpFrame,
  connectionId: number,
): Effect.Effect<RoomFrameResult, never, RoomRegistry | ConnectionHub> {
  const registry = yield* RoomRegistry;
  const hub = yield* ConnectionHub;

  return yield* Match.value(frame.type).pipe(
    Match.when(PacketType.createCustomRoom, () =>
      Effect.gen(function* () {
        const room = yield* registry.create(connectionId);
        return { replies: [lobbySnapshot(room)] };
      }),
    ),
    Match.when(PacketType.joinCustomRoom, () =>
      Effect.gen(function* () {
        try {
          const request = decodeJoinCustomRoom(frame.payload);
          const room = yield* registry
            .join(request.roomId, connectionId)
            .pipe(Effect.orElseSucceed(() => undefined));
          if (room === undefined) return emptyReplies;
          const frames = joinerEnterFrames(room, connectionId);
          yield* hub.broadcast(otherMemberIds(room.members, connectionId), frames);
          return { replies: frames };
        } catch {
          return emptyReplies;
        }
      }),
    ),
    Match.orElse(() =>
      Effect.gen(function* () {
        const current = yield* registry.roomForConnection(connectionId);
        if (Option.isNone(current)) return emptyReplies;
        const roomId = current.value.roomId;

        return yield* Match.value(frame.type).pipe(
          Match.when(PacketType.updateSettings, () =>
            Effect.gen(function* () {
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
                yield* hub.broadcast(otherMemberIds(room.members, connectionId), [
                  lobbySnapshot(room, true),
                ]);
                return { replies: [ack] };
              } catch {
                return emptyReplies;
              }
            }),
          ),
          Match.when(PacketType.legendPick, () =>
            Effect.gen(function* () {
              try {
                const pick = decodeLegendPick(frame.payload);
                yield* registry.updateLobby(roomId, (lobby) => applyLegendPickToState(lobby, pick));
                return emptyReplies;
              } catch {
                return emptyReplies;
              }
            }),
          ),
          Match.when(PacketType.exitScoreboard, () => {
            const snapshot = lobbySnapshot(current.value, true);
            return Effect.succeed({
              replies: [
                {
                  type: PacketType.exitScoreboardResponse,
                  seq: undefined,
                  payload: new Uint8Array(),
                },
                snapshot,
              ],
            });
          }),
          Match.when(PacketType.leaveLobby, () =>
            Effect.gen(function* () {
              const before = current.value;
              const leaving = before.members.find((member) => member.connectionId === connectionId);
              const remaining = yield* registry.leave(connectionId);
              const selfLeave = spectateLeaveSelfFrame();
              if (Option.isSome(remaining)) {
                yield* hub.broadcast(
                  remaining.value.members.map((member) => member.connectionId),
                  [
                    recvLeaveFrame(STUB_USER_ID, leaving?.guestController ?? 0),
                    lobbySnapshot(remaining.value, true),
                  ],
                );
              } else {
                yield* hub.broadcast(otherMemberIds(before.members, connectionId), [selfLeave]);
              }
              return { replies: [selfLeave] };
            }),
          ),
          Match.when(PacketType.localJoin, () =>
            Effect.gen(function* () {
              const before = current.value;
              const room = yield* registry.updateLobby(roomId, (lobby) =>
                applyLocalGuestJoin(lobby, nextGuestController(lobby)),
              );
              if (room.lobby.guests.length === before.lobby.guests.length) {
                const last = room.lobby.guests[room.lobby.guests.length - 1];
                if (last === undefined) return emptyReplies;
                return { replies: [lobbyGuestJoinFrame(last)] };
              }
              const guest = room.lobby.guests[room.lobby.guests.length - 1]!;
              const frames: TcpFrame[] = [lobbyGuestJoinFrame(guest), lobbySnapshot(room, true)];
              yield* hub.broadcast(otherMemberIds(room.members, connectionId), frames);
              return { replies: frames };
            }),
          ),
          Match.when(PacketType.addBot, () =>
            Effect.gen(function* () {
              try {
                const request = decodeAddBotRequest(frame.payload);
                if (!request.add) {
                  const before = current.value;
                  const room = yield* registry.updateLobby(roomId, (lobby) =>
                    applyLocalGuestJoin(lobby, request.controller),
                  );
                  if (room.lobby.guests.length === before.lobby.guests.length) {
                    const last = room.lobby.guests.find(
                      (guest) => guest.controller === request.controller,
                    );
                    if (last === undefined) return emptyReplies;
                    return { replies: [lobbyGuestJoinFrame(last)] };
                  }
                  const guest = room.lobby.guests.find(
                    (entry) => entry.controller === request.controller,
                  );
                  if (guest === undefined) return emptyReplies;
                  const frames: TcpFrame[] = [
                    lobbyGuestJoinFrame(guest),
                    lobbySnapshot(room, true),
                  ];
                  yield* hub.broadcast(otherMemberIds(room.members, connectionId), frames);
                  return { replies: frames };
                }
                const before = current.value;
                const room = yield* registry.updateLobby(roomId, (lobby) =>
                  applyAddBotRequest(lobby, request),
                );
                if (room.lobby.bots.length === before.lobby.bots.length) return emptyReplies;
                const frames: TcpFrame[] = [lobbyJoinFrame(request.controller)];
                yield* hub.broadcast(otherMemberIds(room.members, connectionId), [
                  ...frames,
                  lobbySnapshot(room, true),
                ]);
                return { replies: frames };
              } catch {
                return emptyReplies;
              }
            }),
          ),
          Match.orElse(() => Effect.succeed(emptyReplies)),
        );
      }),
    ),
  );
});

export const isRoomPacket = (type: number): boolean =>
  Match.value(type).pipe(
    Match.whenOr(
      PacketType.createCustomRoom,
      PacketType.joinCustomRoom,
      PacketType.updateSettings,
      PacketType.legendPick,
      PacketType.exitScoreboard,
      PacketType.leaveLobby,
      PacketType.localJoin,
      PacketType.addBot,
      () => true,
    ),
    Match.orElse(() => false),
  );
