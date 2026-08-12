import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [".repos/**"],
  },
  lint: {
    ignorePatterns: [".repos/**"],
  },
  run: {
    cache: true,
  },
});
