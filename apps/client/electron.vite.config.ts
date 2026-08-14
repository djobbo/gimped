import { foldkit } from "@foldkit/vite-plugin";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: ["@gimped/common", "@gimped/patch"],
      },
    },
  },
  preload: {},
  renderer: {
    plugins: [foldkit()],
  },
});
