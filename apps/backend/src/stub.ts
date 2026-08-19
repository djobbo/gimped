import { Console, Effect, Ref } from "effect";
import * as Socket from "effect/unstable/socket/Socket";
import * as SocketServer from "effect/unstable/socket/SocketServer";
import { encodeAssignGameServer, STUB_GAME_TOKEN, STUB_LEVEL_ID } from "./assign-game-server.ts";
import { decodePayload } from "./decode.ts";
import { encodeFrame, FrameDecoder, type TcpFrame } from "./framing.ts";
import { GameRuntime } from "./game-runtime.ts";
import { STUB_USER_ID } from "./login-accepted.ts";
import { MatchSpec } from "./match-spec.ts";
import { nameForType, PacketType } from "./packets.ts";
import { repliesFor } from "./replies.ts";
import type { Session } from "./session.ts";

export type LobbyFlags = {
  readonly includeBot: boolean;
};

const describeAddress = (address: SocketServer.Address): string =>
  address._tag === "TcpAddress" ? `${address.hostname}:${address.port}` : address.path;

export const ingestChunk = Effect.fn("ingestChunk")(function* (
  decoder: FrameDecoder,
  session: Session,
  connection: number,
  chunk: Uint8Array,
  flags: Ref.Ref<LobbyFlags>,
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
                    : decoded._tag === "AddBot"
                      ? `controller=${decoded.controller}`
                      : decoded._tag === "StartMatch"
                        ? "play"
                        : decoded._tag === "AssignGameServer"
                          ? `${decoded.host}:${decoded.tcpPort}/${decoded.udpPort}`
                          : `${frame.payload.length} bytes`;
    yield* Console.log(
      `conn=${connection} type=${frame.type} ${nameForType(frame.type)} seq=${frame.seq ?? "-"} ${summary}`,
    );
    yield* session.note(`packet type=${captured.type} name=${captured.name}`);
    if (frame.type === PacketType.createCustomRoom) {
      yield* Ref.set(flags, { includeBot: false });
      replies.push(...repliesFor(frame));
      continue;
    }
    if (frame.type === PacketType.addBot) {
      const botReplies = repliesFor(frame);
      if (botReplies.some((reply) => reply.type === PacketType.lobbyJoin)) {
        yield* Ref.set(flags, { includeBot: true });
      }
      replies.push(...botReplies);
      continue;
    }
    if (frame.type === PacketType.startMatch) {
      const runtime = yield* GameRuntime;
      const { includeBot } = yield* Ref.get(flags);
      const allocated = yield* runtime
        .allocate(
          new MatchSpec({
            userId: STUB_USER_ID,
            token: STUB_GAME_TOKEN,
            levelId: STUB_LEVEL_ID,
            includeBot,
          }),
        )
        .pipe(
          Effect.catchTag("GameListenTimeout", (error) =>
            Effect.gen(function* () {
              yield* Console.log(`game allocate failed: ${error.message}`);
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
    replies.push(...repliesFor(frame));
  }
  return replies;
});

export const handleSocket = Effect.fn("handleSocket")(function* (
  socket: Socket.Socket,
  session: Session,
  connection: number,
  label: string,
  flags: Ref.Ref<LobbyFlags>,
) {
  yield* Effect.scoped(
    Effect.gen(function* () {
      const decoder = new FrameDecoder();
      const write = yield* socket.writer;
      yield* session.note(`${label} connection ${connection} opened`);
      yield* Console.log(`${label} conn=${connection} opened`);
      yield* socket.run((chunk) =>
        Effect.gen(function* () {
          const replies = yield* ingestChunk(decoder, session, connection, chunk, flags);
          for (const reply of replies) {
            yield* write(encodeFrame(reply));
            yield* Console.log(
              `${label} conn=${connection} reply type=${reply.type} ${nameForType(reply.type)} ${reply.payload.length} bytes`,
            );
            yield* session.note(
              `${label} reply type=${reply.type} name=${nameForType(reply.type)}`,
            );
          }
        }),
      );
      yield* session.note(`${label} connection ${connection} closed`);
      yield* Console.log(`${label} conn=${connection} closed`);
    }),
  );
});

export const runStub = Effect.fn("runStub")(function* (
  session: Session,
  options: { readonly label: string; readonly startId: number } = { label: "backend", startId: 1 },
) {
  const server = yield* SocketServer.SocketServer;
  const nextId = yield* Ref.make(options.startId);
  const flags = yield* Ref.make<LobbyFlags>({ includeBot: false });
  yield* Console.log(`${options.label} TCP stub listening on ${describeAddress(server.address)}`);
  if (options.label === "backend") {
    yield* Console.log(`session directory: ${session.dir}`);
  }

  yield* server.run((socket) =>
    Effect.gen(function* () {
      const connection = yield* Ref.getAndUpdate(nextId, (n) => n + 1);
      yield* handleSocket(socket, session, connection, options.label, flags);
    }).pipe(
      Effect.catchCause((cause) => session.note(`${options.label} connection error: ${cause}`)),
    ),
  );
});
