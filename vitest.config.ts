// vitest.config.ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: [
      "src/**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "src/**/*-test.ts",
      "src/**/*.test.ts",
      "tests/unit/**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "tests/integration/**/*.{test,spec}.?(c|m)[jt]s?(x)",
    ],
    environment: "node",
  },
});
