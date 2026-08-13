import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [".repos/**", ".superpowers/**"],
  },
  lint: {
    ignorePatterns: [".repos/**", ".superpowers/**"],
    jsPlugins: [{ name: "unslopped", specifier: "./tools/oxlint/unslopped/index.ts" }],
    rules: {
      "unslopped/no-chained-type-assertions": "error",
      "unslopped/no-conditional-empty-object-spread": "error",
      "unslopped/no-known-value-widening": "error",
      "unslopped/no-module-mocking": "error",
      "unslopped/no-object-parameters": "error",
      "unslopped/no-reflect-apply": "error",
      "unslopped/no-reflect-get": "error",
      "unslopped/no-runtime-typeof": "error",
      "unslopped/no-shape-in-symbol-names": "error",
      "unslopped/no-unknown-parameters": "error",
      "unslopped/no-unknown-returns": "error",
      "unslopped/no-unknown-type-aliases": "error",
      "unslopped/no-unsafe-dictionary-type": "error",
      "unslopped/no-widen-then-assert": "error",
      "unslopped/require-safety-comment-for-type-assertion": "error",
    },
  },
  test: {
    exclude: ["**/node_modules/**", ".worktrees/**", ".repos/**", ".superpowers/**"],
  },
  run: {
    cache: true,
  },
});
