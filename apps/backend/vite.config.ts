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
  },
  build: {
    lib: {
      entry: "src/bin.ts",
      formats: ["es"],
      fileName: "bin",
    },
    rollupOptions: {
      external: [/^effect(?:\/|$)/, /^@effect\//, /^@gimped\//, /^node:/],
    },
  },
});
