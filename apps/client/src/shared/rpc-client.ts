import { Effect, Layer, Queue, Stream } from "effect";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import type { FromClientEncoded, FromServerEncoded } from "effect/unstable/rpc/RpcMessage";

export interface IpcClientPort {
  onmessage: ((event: { data: string | Uint8Array }) => void) | null;
  postMessage: (message: string | Uint8Array) => void;
  start: () => void;
  close: () => void;
}

export const makeIpcClientProtocol = (port: IpcClientPort) =>
  RpcClient.Protocol.make(
    Effect.fnUntraced(function* (writeResponse, clientIds) {
      const serialization = yield* RpcSerialization.RpcSerialization;
      const parser = serialization.makeUnsafe();
      const inbound = yield* Queue.unbounded<FromServerEncoded>();

      port.onmessage = (event) => {
        try {
          for (const decoded of parser.decode(event.data)) {
            // SAFETY: this client protocol only inbound-decodes FromServerEncoded frames.
            Queue.offerUnsafe(inbound, decoded as FromServerEncoded);
          }
        } catch {
          // Drop a malformed frame rather than throwing inside the host's raw
          // message callback (one bad message shouldn't take down the connection).
        }
      };
      // Detach and close on scope teardown so a rebuilt client (renderer reload,
      // fresh port) leaves no stale closure writing into a dead registry.
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          port.onmessage = null;
          port.close();
        }),
      );
      port.start();

      // Order inbound frames through a Queue drained on a scoped fiber, so
      // writeResponse never runs inside the raw onmessage callback.
      yield* Effect.forkScoped(
        Stream.fromQueue(inbound).pipe(
          Stream.runForEach((decoded) =>
            Effect.forEach(clientIds, (clientId) => writeResponse(clientId, decoded), {
              discard: true,
            }),
          ),
        ),
      );

      const send = (_clientId: number, request: FromClientEncoded) =>
        Effect.sync(() => {
          const encoded = parser.encode(request);
          if (encoded !== undefined) {
            port.postMessage(encoded);
          }
        });

      return {
        send,
        supportsAck: true,
        // Electron's MessagePortMain cannot transfer ArrayBuffers (electron#34905);
        // binary rides as MsgPack-copied bytes instead of zero-copy transfer.
        supportsTransferables: false,
      };
    }),
  );

export const layerIpcClient = (port: IpcClientPort): Layer.Layer<RpcClient.Protocol> =>
  Layer.effect(RpcClient.Protocol, makeIpcClientProtocol(port)).pipe(
    Layer.provide(RpcSerialization.layerMsgPack),
  );
