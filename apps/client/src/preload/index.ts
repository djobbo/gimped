import { ipcRenderer } from "electron";

ipcRenderer.on("rpc-port", (event) => {
  const [port] = event.ports;
  if (port !== undefined) {
    window.postMessage("rpc-port", "*", [port]);
  }
});
