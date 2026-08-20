import { Effect, Ref } from "effect";
import * as Socket from "effect/unstable/socket/Socket";
import * as SocketServer from "effect/unstable/socket/SocketServer";
import { encodeAssignGameServer, STUB_GAME_TOKEN, STUB_LEVEL_ID } from "./assign-game-server.ts";
import { decodePayload } from "./decode.ts";
import { encodeFrame, FrameDecoder, type TcpFrame } from "./framing.ts";
import { GameRuntime } from "./game-runtime.ts";
import { STUB_USER_ID } from "./login-accepted.ts";
import { initialLobbyState, type LobbyState } from "./lobby-state.ts";
import { MatchSetupSpec, MatchSpec } from "./match-spec.ts";
import { nameForType, PacketType } from "./packets.ts";
import { handleFrame } from "./replies.ts";
import type { Session } from "./session.ts";

const describeAddress = (address: SocketServer.Address): string =>
  address._tag === "TcpAddress" ? `${address.hostname}:${address.port}` : address.path;

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
  session: Session,
  connection: number,
  chunk: Uint8Array,
  lobbyRef: Ref.Ref<LobbyState>,
) {
  const frames = decoder.push(chunk);
  const replies: TcpFrame[] = [];
  for (const frame of frames) {
    const captured = yield* session.record(connection, frame);
    const decoded = decodePayload(frame.type, frame.payload);
    const summary =
      decoded._tag === "ProtocolHello"
        ? decoded.text
        : decoded._tag === "ClientVersion"
          ? `stamp=${decoded.versionStamp} platform=${decoded.platformId}`
          : decoded._tag === "LoginRequest"
            ? `ticket=${decoded.ticketBytes} bytes`
            : decoded._tag === "LoginAccepted"
              ? `user=${decoded.userId} name=${decoded.displayName}`
              : decoded._tag === "CreateCustomRoom"
                ? `playlist=${decoded.playlistId} customType=${decoded.customGameType}`
                : decoded._tag === "CustomLobby"
                  ? `room=${decoded.roomCode} host=${decoded.hostUserId} max=${decoded.maxPlayers} region=${decoded.regionId}`
                  : decoded._tag === "LobbySettings"
                    ? `max=${decoded.maxPlayers} region=${decoded.regionId}`
                    : decoded._tag === "LegendPick"
                      ? `hero=${decoded.heroId} bot=${decoded.isBot}`
                      : decoded._tag === "AddBot"
                        ? `controller=${decoded.controller}`
                        : decoded._tag === "StartMatch"
                          ? "play"
                          : decoded._tag === "AssignGameServer"
                            ? `${decoded.host}:${decoded.tcpPort}/${decoded.udpPort}`
                            : `${frame.payload.length} bytes`;
    yield* Effect.log(
      `conn=${connection} type=${frame.type} ${nameForType(frame.type)} seq=${frame.seq ?? "-"} ${summary}`,
    );
    yield* session.note(`packet type=${captured.type} name=${captured.name}`);
    const lobby = yield* Ref.get(lobbyRef);
    if (frame.type === PacketType.startMatch) {
      const runtime = yield* GameRuntime;
      const allocated = yield* runtime.allocate(matchSpecFromLobby(lobby)).pipe(
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
    const handled = handleFrame(frame, lobby);
    yield* Ref.set(lobbyRef, handled.lobby);
    replies.push(...handled.replies);
  }
  return replies;
});

export const handleSocket = Effect.fn("handleSocket")(function* (
  socket: Socket.Socket,
  session: Session,
  connection: number,
  label: string,
  lobbyRef: Ref.Ref<LobbyState>,
) {
  yield* Effect.scoped(
    Effect.gen(function* () {
      const decoder = new FrameDecoder();
      const write = yield* socket.writer;
      yield* session.note(`${label} connection ${connection} opened`);
      yield* Effect.log(`${label} conn=${connection} opened`);
      yield* socket.run((chunk) =>
        Effect.gen(function* () {
          const replies = yield* ingestChunk(decoder, session, connection, chunk, lobbyRef);
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
  session: Session,
  options: { readonly label: string; readonly startId: number } = { label: "backend", startId: 1 },
) {
  const server = yield* SocketServer.SocketServer;
  const nextId = yield* Ref.make(options.startId);
  yield* Effect.log(`${options.label} TCP stub listening on ${describeAddress(server.address)}`);
  if (options.label === "backend") {
    yield* Effect.log(`session directory: ${session.dir}`);
  }

  yield* server.run((socket) =>
    Effect.gen(function* () {
      const connection = yield* Ref.getAndUpdate(nextId, (n) => n + 1);
      const lobbyRef = yield* Ref.make(initialLobbyState());
      yield* handleSocket(socket, session, connection, options.label, lobbyRef);
    }).pipe(
      Effect.catchCause((cause) => session.note(`${options.label} connection error: ${cause}`)),
    ),
  );
});
