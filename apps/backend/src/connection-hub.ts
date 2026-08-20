import { Context, Effect, Layer, Ref } from "effect";
import { encodeFrame, type TcpFrame } from "./framing.ts";

export type FrameWriter = (bytes: Uint8Array) => Effect.Effect<void>;

export class ConnectionHub extends Context.Service<
  ConnectionHub,
  {
    readonly register: (connectionId: number, write: FrameWriter) => Effect.Effect<void>;
    readonly unregister: (connectionId: number) => Effect.Effect<void>;
    readonly send: (connectionId: number, frames: ReadonlyArray<TcpFrame>) => Effect.Effect<void>;
    readonly broadcast: (
      connectionIds: ReadonlyArray<number>,
      frames: ReadonlyArray<TcpFrame>,
    ) => Effect.Effect<void>;
  }
>()("@gimped/backend/ConnectionHub") {
  static readonly layerMemory: Layer.Layer<ConnectionHub> = Layer.effect(
    ConnectionHub,
    Effect.gen(function* () {
      const writersRef = yield* Ref.make(new Map<number, FrameWriter>());

      const register = Effect.fn("ConnectionHub.register")(function* (
        connectionId: number,
        write: FrameWriter,
      ) {
        yield* Ref.update(writersRef, (writers) => {
          const next = new Map(writers);
          next.set(connectionId, write);
          return next;
        });
      });

      const unregister = Effect.fn("ConnectionHub.unregister")(function* (connectionId: number) {
        yield* Ref.update(writersRef, (writers) => {
          const next = new Map(writers);
          next.delete(connectionId);
          return next;
        });
      });

      const send = Effect.fn("ConnectionHub.send")(function* (
        connectionId: number,
        frames: ReadonlyArray<TcpFrame>,
      ) {
        const writers = yield* Ref.get(writersRef);
        const write = writers.get(connectionId);
        if (write === undefined) return;
        for (const frame of frames) {
          yield* write(encodeFrame(frame));
        }
      });

      const broadcast = Effect.fn("ConnectionHub.broadcast")(function* (
        connectionIds: ReadonlyArray<number>,
        frames: ReadonlyArray<TcpFrame>,
      ) {
        for (const connectionId of connectionIds) {
          yield* send(connectionId, frames);
        }
      });

      return { register, unregister, send, broadcast };
    }),
  );
}

export const otherMemberIds = (
  members: ReadonlyArray<{ readonly connectionId: number }>,
  exceptConnectionId: number,
): ReadonlyArray<number> =>
  members.filter((member) => member.connectionId !== exceptConnectionId).map((m) => m.connectionId);
