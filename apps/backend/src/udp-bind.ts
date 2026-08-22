import { Effect } from "effect";
import { createSocket, type RemoteInfo, type Socket } from "node:dgram";
import { UdpBindError } from "./errors.ts";

export type UdpBinding = {
  readonly port: number;
  readonly socket: Socket;
};

export const bindUdp = Effect.fn("bindUdp")(function* (host: string) {
  const socket = createSocket("udp4");
  socket.on("error", () => undefined);
  yield* Effect.addFinalizer(() =>
    Effect.callback<void>((resume) => {
      socket.close(() => resume(Effect.void));
    }),
  );
  yield* Effect.callback<void, UdpBindError>((resume) => {
    socket.once("error", (error) =>
      resume(
        Effect.fail(
          new UdpBindError({
            host,
            message: error instanceof Error ? error.message : String(error),
          }),
        ),
      ),
    );
    socket.bind(0, host, () => resume(Effect.void));
  });
  const addr = socket.address();
  return { port: addr.port, socket } satisfies UdpBinding;
});

export const runUdpListener = (
  socket: Socket,
  onMessage: (payload: Uint8Array, remote: RemoteInfo) => Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    const handler = (message: Buffer, remote: RemoteInfo) => {
      Effect.runPromise(onMessage(new Uint8Array(message), remote)).catch(() => undefined);
    };
    socket.on("message", handler);
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        socket.off("message", handler);
      }),
    );
    yield* Effect.never;
  });
