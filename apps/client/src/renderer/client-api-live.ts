import { Effect, Layer, Option, Predicate } from "effect";
import { RpcClient } from "effect/unstable/rpc";
import { ClientRpcs } from "../shared/client-rpc.ts";
import { type IpcClientPort, layerIpcClient } from "../shared/rpc-client.ts";
import { ClientApi } from "./client-api.ts";

export const layerClientApi: Layer.Layer<ClientApi, never, RpcClient.Protocol> = Layer.scoped(
  ClientApi,
  Effect.gen(function* () {
    const client = yield* RpcClient.make(ClientRpcs);
    return ClientApi.of({
      patchFetch: (payload) => client.PatchFetch(payload),
      patchClear: (payload) => client.PatchClear(payload),
      submitSteamGuard: (code) => client.SubmitSteamGuard({ code }),
      settingsGet: client.SettingsGet(),
      settingsSet: (username, password) => client.SettingsSet({ username, password }),
    });
  }),
);

let resolvePort!: (port: MessagePort) => void;
const portReady = new Promise<MessagePort>((resolve) => {
  resolvePort = resolve;
});
if (Predicate.hasProperty(globalThis, "window")) {
  const onMessage = (event: MessageEvent) => {
    if (event.data === "rpc-port") {
      const maybePort = Option.fromNullishOr(event.ports.item(0));
      if (Option.isSome(maybePort)) {
        window.removeEventListener("message", onMessage);
        resolvePort(maybePort.value);
      }
    }
  };
  window.addEventListener("message", onMessage);
}

export const toClientPort = (port: MessagePort): IpcClientPort => ({
  get onmessage() {
    // SAFETY: DOM MessagePort.onmessage is Event-typed; IpcClientPort only
    // reads `{ data }` from the message event.
    return port.onmessage as IpcClientPort["onmessage"];
  },
  set onmessage(handler: IpcClientPort["onmessage"]) {
    port.onmessage = handler === null ? null : (event) => handler({ data: event.data });
  },
  postMessage: (message) => port.postMessage(message),
  start: () => port.start(),
  close: () => port.close(),
});

const layerRpcClient: Layer.Layer<RpcClient.Protocol> = Layer.unwrapEffect(
  Effect.promise(() => portReady).pipe(Effect.map((port) => layerIpcClient(toClientPort(port)))),
);

export const ClientApiLive: Layer.Layer<ClientApi> = layerClientApi.pipe(
  Layer.provide(layerRpcClient),
);
