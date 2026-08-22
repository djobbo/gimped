import { Effect, Match, Option, Ref } from "effect";
import * as Socket from "effect/unstable/socket/Socket";
import * as SocketServer from "effect/unstable/socket/SocketServer";
import { encodeAssignGameServer, STUB_GAME_TOKEN, STUB_LEVEL_ID } from "./assign-game-server.ts";
import { ConnectionHub } from "./connection-hub.ts";
import { decodePayload } from "./decode.ts";
import { encodeFrame, FrameDecoder, type TcpFrame } from "./framing.ts";
import { GameRuntime } from "./game-runtime.ts";
import { STUB_USER_ID } from "./login-accepted.ts";
import { MatchSetupSpec, MatchSpec } from "./match-spec.ts";
import type { LobbyState } from "./lobby-state.ts";
import type { DecodedPayload } from "./messages.ts";
import { nameForType, PacketType } from "./packets.ts";
import { handleFrame } from "./replies.ts";
import { handleRoomFrame, isRoomPacket } from "./room-replies.ts";
import { RoomRegistry } from "./room-registry.ts";
import { Session } from "./session.ts";

const describeAddress = (address: SocketServer.Address): string =>
  Match.valueTags(address, {
    TcpAddress: (tcp) => `${tcp.hostname}:${tcp.port}`,
    UnixAddress: (unix) => unix.path,
  });

const summarizeDecoded = (decoded: DecodedPayload, payloadBytes: number): string =>
  Match.value(decoded).pipe(
    Match.tags({
      ProtocolHello: (packet) => packet.text,
      ClientVersion: (packet) => `stamp=${packet.versionStamp} platform=${packet.platformId}`,
      LoginRequest: (packet) => `ticket=${packet.ticketBytes} bytes`,
      LoginAccepted: (packet) => `user=${packet.userId} name=${packet.displayName}`,
      CreateCustomRoom: (packet) =>
        `playlist=${packet.playlistId} customType=${packet.customGameType}`,
      CustomLobby: (packet) =>
        `room=${packet.roomCode} host=${packet.hostUserId} max=${packet.maxPlayers} region=${packet.regionId}`,
      LobbySettings: (packet) => `max=${packet.maxPlayers} region=${packet.regionId}`,
      LegendPick: (packet) => `hero=${packet.heroId} bot=${packet.isBot}`,
      AddBot: (packet) => `controller=${packet.controller}`,
      StartMatch: () => "play",
      AssignGameServer: (packet) => `${packet.host}:${packet.tcpPort}/${packet.udpPort}`,
    }),
    Match.orElse(() => `${payloadBytes} bytes`),
  );

const matchSpecFromLobby = (lobby: LobbyState): MatchSpec =>
  new MatchSpec({
    userId: STUB_USER_ID,
    token: STUB_GAME_TOKEN,
    levelId: STUB_LEVEL_ID,
    setup: new MatchSetupSpec({
      hostHeroId: lobby.hostHeroId,
      hostCostumeId: lobby.hostCostumeId,
      hostHeroSlots: lobby.hostHeroSlots.map((slot) => ({
        heroId: slot.heroId,
        costumeId: slot.costumeId,
      })),
      ruleset: [...lobby.ruleset],
      guests: lobby.guests.map((guest) => ({
        controller: guest.controller,
        entityId: guest.entityId,
        heroId: guest.heroId,
        costumeId: guest.costumeId,
        heroSlots: guest.heroSlots.map((slot) => ({
          heroId: slot.heroId,
          costumeId: slot.costumeId,
        })),
      })),
      bots: lobby.bots.map((bot) => ({
        controller: bot.controller,
        entityId: bot.entityId,
        heroId: bot.heroId,
        costumeId: bot.costumeId,
      })),
    }),
  });

export const ingestChunk = Effect.fn("ingestChunk")(function* (
  decoder: FrameDecoder,
  connection: number,
  chunk: Uint8Array,
) {
  const session = yield* Session;
  const frames = decoder.push(chunk);
  const replies: TcpFrame[] = [];
  const registry = yield* RoomRegistry;
  for (const frame of frames) {
    const captured = yield* session.record(connection, frame);
    const decoded = decodePayload(frame.type, frame.payload);
    const summary = summarizeDecoded(decoded, frame.payload.length);
    yield* Effect.log(
      `conn=${connection} type=${frame.type} ${nameForType(frame.type)} seq=${frame.seq ?? "-"} ${summary}`,
    );
    yield* session.note(`packet type=${captured.type} name=${captured.name}`);

    if (frame.type === PacketType.startMatch) {
      const room = yield* registry.roomForConnection(connection);
      if (Option.isNone(room)) continue;
      const runtime = yield* GameRuntime;
      const allocated = yield* runtime.allocate(matchSpecFromLobby(room.value.lobby)).pipe(
        Effect.catchTag("GameListenTimeout", (error) =>
          Effect.gen(function* () {
            yield* Effect.log(`game allocate failed: ${error.message}`);
            yield* session.note(`allocate failed ${error.message}`);
            return undefined;
          }),
        ),
      );
      if (allocated !== undefined) {
        yield* session.note(
          `game allocate id=${allocated.id} tcp=${allocated.host}:${allocated.tcpPort} udp=${allocated.udpPort}`,
        );
        replies.push({
          type: PacketType.assignGameServer,
          seq: undefined,
          payload: encodeAssignGameServer({
            userId: STUB_USER_ID,
            levelId: STUB_LEVEL_ID,
            token: allocated.token,
            host: allocated.host,
            tcpPort: allocated.tcpPort,
            udpPort: allocated.udpPort,
            useNetworkNext: false,
          }),
        });
      }
      continue;
    }

    if (isRoomPacket(frame.type)) {
      const handled = yield* handleRoomFrame(frame, connection);
      replies.push(...handled.replies);
      continue;
    }

    const handled = handleFrame(frame);
    replies.push(...handled.replies);
  }
  return replies;
});

export const handleSocket = Effect.fn("handleSocket")(function* (
  socket: Socket.Socket,
  connection: number,
  label: string,
) {
  const session = yield* Session;
  const hub = yield* ConnectionHub;
  const registry = yield* RoomRegistry;
  yield* Effect.scoped(
    Effect.gen(function* () {
      const decoder = new FrameDecoder();
      const write = yield* socket.writer;
      yield* hub.register(connection, write);
      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          yield* hub.unregister(connection);
          yield* registry.leave(connection);
        }),
      );
      yield* session.note(`${label} connection ${connection} opened`);
      yield* Effect.log(`${label} conn=${connection} opened`);
      yield* socket.run((chunk) =>
        Effect.gen(function* () {
          const replies = yield* ingestChunk(decoder, connection, chunk);
          for (const reply of replies) {
            yield* write(encodeFrame(reply));
            yield* Effect.log(
              `${label} conn=${connection} reply type=${reply.type} ${nameForType(reply.type)} ${reply.payload.length} bytes`,
            );
            yield* session.note(
              `${label} reply type=${reply.type} name=${nameForType(reply.type)}`,
            );
          }
        }),
      );
      yield* session.note(`${label} connection ${connection} closed`);
      yield* Effect.log(`${label} conn=${connection} closed`);
    }),
  );
});

export const runStub = Effect.fn("runStub")(function* (
  options: { readonly label: string; readonly startId: number } = { label: "backend", startId: 1 },
) {
  const session = yield* Session;
  const server = yield* SocketServer.SocketServer;
  const nextId = yield* Ref.make(options.startId);
  yield* Effect.log(`${options.label} TCP stub listening on ${describeAddress(server.address)}`);
  if (options.label === "backend") {
    yield* Effect.log(`session directory: ${session.dir}`);
  }

  yield* server.run((socket) =>
    Effect.gen(function* () {
      const connection = yield* Ref.getAndUpdate(nextId, (n) => n + 1);
      yield* handleSocket(socket, connection, options.label);
    }).pipe(
      Effect.catchCause((cause) => session.note(`${options.label} connection error: ${cause}`)),
    ),
  );
});
