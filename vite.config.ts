import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [".repos/**", ".superpowers/**"],
  },
  lint: {
    ignorePatterns: [".repos/**", ".superpowers/**"],
  },
  run: {
    cache: true,
  },
});
