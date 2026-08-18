import { Console, Effect, Ref } from "effect";
import * as Socket from "effect/unstable/socket/Socket";
import * as SocketServer from "effect/unstable/socket/SocketServer";
import { decodePayload } from "./decode.ts";
import { encodeFrame, FrameDecoder, type TcpFrame } from "./framing.ts";
import { nameForType } from "./packets.ts";
import { repliesFor } from "./replies.ts";
import type { Session } from "./session.ts";

const describeAddress = (address: SocketServer.Address): string =>
  address._tag === "TcpAddress" ? `${address.hostname}:${address.port}` : address.path;

export const ingestChunk = Effect.fn("ingestChunk")(function* (
  decoder: FrameDecoder,
  session: Session,
  connection: number,
  chunk: Uint8Array,
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
    replies.push(...repliesFor(frame));
  }
  return replies;
});

export const handleSocket = Effect.fn("handleSocket")(function* (
  socket: Socket.Socket,
  session: Session,
  connection: number,
  label: string,
) {
  yield* Effect.scoped(
    Effect.gen(function* () {
      const decoder = new FrameDecoder();
      const write = yield* socket.writer;
      yield* session.note(`${label} connection ${connection} opened`);
      yield* Console.log(`${label} conn=${connection} opened`);
      yield* socket.run((chunk) =>
        Effect.gen(function* () {
          const replies = yield* ingestChunk(decoder, session, connection, chunk);
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
  yield* Console.log(`${options.label} TCP stub listening on ${describeAddress(server.address)}`);
  if (options.label === "backend") {
    yield* Console.log(`session directory: ${session.dir}`);
  }

  yield* server.run((socket) =>
    Effect.gen(function* () {
      const connection = yield* Ref.getAndUpdate(nextId, (n) => n + 1);
      yield* handleSocket(socket, session, connection, options.label);
    }).pipe(
      Effect.catchCause((cause) => session.note(`${options.label} connection error: ${cause}`)),
    ),
  );
});
