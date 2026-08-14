import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "happy-dom",
    setupFiles: ["src/renderer/vitest-setup.ts"],
    server: {
      deps: {
        inline: ["foldkit", "@foldkit/ui"],
      },
    },
  },
});
