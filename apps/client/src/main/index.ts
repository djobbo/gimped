import { NodeServices } from "@effect/platform-node";
import { layer as patchLayer } from "@gimped/patch";
import {
  app,
  BrowserWindow,
  MessageChannelMain,
  safeStorage,
  type MessagePortMain,
} from "electron";
import { Layer, ManagedRuntime } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { RpcServer } from "effect/unstable/rpc";
import { join } from "node:path";
import { ClientRpcs } from "../shared/client-rpc.ts";
import {
  makeHandlersLive,
  SteamCredentialsLive,
  SteamGuardLive,
  SteamGuardSlotLive,
} from "./handlers.ts";
import { type IpcServerPort, layerIpcServer, RpcPortHandoff } from "./ipc-server.ts";
import { SafeStorage } from "./steam-store.ts";

const SafeStorageLive = Layer.sync(SafeStorage, () => ({
  isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
  encryptString: (plain: string) => new Uint8Array(safeStorage.encryptString(plain)),
  decryptString: (bytes: Uint8Array) => safeStorage.decryptString(Buffer.from(bytes)),
  userData: app.getPath("userData"),
}));

const Live = RpcServer.layer(ClientRpcs, { disableFatalDefects: true }).pipe(
  Layer.provide(makeHandlersLive([process.cwd(), app.getAppPath()])),
  Layer.provideMerge(layerIpcServer),
  Layer.provide(
    patchLayer.pipe(
      Layer.provide(SteamGuardLive),
      Layer.provide(SteamCredentialsLive),
      Layer.provideMerge(NodeServices.layer),
      Layer.provide(FetchHttpClient.layer),
    ),
  ),
  Layer.provide(SafeStorageLive),
  Layer.provide(SteamGuardSlotLive),
);

const runtime = ManagedRuntime.make(Live);

const toServerPort = (port: MessagePortMain): IpcServerPort => {
  const wrapped = new Map<
    (...args: Array<unknown>) => void,
    (messageEvent: { data: unknown }) => void
  >();
  // SAFETY: Electron's message/close overloads don't share a listener type;
  // IpcServerPort.on is the structural EventEmitter shape the transport uses.
  const on = ((event: "message" | "close", listener: (...args: Array<unknown>) => void) => {
    if (event === "message") {
      const handler = (messageEvent: { data: unknown }): void => {
        listener({ data: messageEvent.data });
      };
      wrapped.set(listener, handler);
      port.on("message", handler);
    } else {
      port.on("close", listener);
    }
  }) as IpcServerPort["on"];
  // SAFETY: IpcServerPort.off is only used to detach the wrapped message
  // listener stored in `wrapped`; close listeners are not removed this way.
  const off = ((_event: "message", listener: (...args: Array<unknown>) => void) => {
    const handler = wrapped.get(listener);
    if (handler !== undefined) {
      port.off("message", handler);
      wrapped.delete(listener);
    }
  }) as IpcServerPort["off"];
  return {
    on,
    off,
    postMessage: (message) => port.postMessage(message),
    start: () => port.start(),
    close: () => port.close(),
  };
};

const createWindow = (bind: (port: IpcServerPort) => void): void => {
  const window = new BrowserWindow({
    width: 960,
    height: 720,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: false,
    },
  });

  window.webContents.on("did-finish-load", () => {
    const channel = new MessageChannelMain();
    window.webContents.postMessage("rpc-port", null, [channel.port2]);
    bind(toServerPort(channel.port1));
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl !== undefined) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
};

app.whenReady().then(
  () =>
    runtime.runPromise(RpcPortHandoff).then((handoff) => {
      createWindow(handoff.bind);
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow(handoff.bind);
        }
      });
    }),
  (cause) => {
    console.error("Failed to start the Effect RPC server", cause);
    app.quit();
  },
);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    void runtime.dispose().finally(() => app.quit());
  }
});
