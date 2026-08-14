import { type MessagePort } from "node:worker_threads";
import { type IpcClientPort } from "../shared/rpc-client.ts";
import { type IpcServerPort } from "./ipc-server.ts";

export function clientAdapter(port: MessagePort): IpcClientPort {
  const adapter: IpcClientPort = {
    onmessage: null,
    postMessage: (message) => port.postMessage(message),
    start: () => port.start(),
    close: () => port.close(),
  };
  port.on("message", (data: string | Uint8Array) => {
    if (adapter.onmessage) {
      adapter.onmessage({ data });
    }
  });
  return adapter;
}

export function serverAdapter(port: MessagePort): IpcServerPort {
  return {
    on(
      event: "message" | "close",
      listener: ((event: { data: string | Uint8Array }) => void) | (() => void),
    ) {
      if (event === "message") {
        port.on("message", (data: string | Uint8Array) => {
          // SAFETY: message listeners always receive the `{ data }` wrapper.
          (listener as (event: { data: string | Uint8Array }) => void)({ data });
        });
      } else {
        // SAFETY: close listeners are registered with a zero-argument callback.
        port.on("close", listener as () => void);
      }
    },
    off: () => {
      // Single-client tests never swap the bound port mid-test.
    },
    postMessage: (message: string | Uint8Array) => port.postMessage(message),
    start: () => port.start(),
    close: () => port.close(),
  };
}
