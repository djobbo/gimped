import { Effect } from "effect";
import { createSocket } from "node:dgram";

export const bindUdp = Effect.fn("bindUdp")(function* (host: string) {
  const socket = createSocket("udp4");
  yield* Effect.addFinalizer(() =>
    Effect.callback<void>((resume) => {
      socket.close(() => resume(Effect.void));
    }),
  );
  yield* Effect.callback<void, Error>((resume) => {
    socket.once("error", (error) => resume(Effect.fail(error)));
    socket.bind(0, host, () => resume(Effect.void));
  });
  const addr = socket.address();
  return { port: addr.port };
});
