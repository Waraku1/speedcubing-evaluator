// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "src/**/*-test.ts",
      "src/**/*.test.ts",
    ],
    environment: "node",
  },
});