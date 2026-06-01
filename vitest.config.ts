import { defineConfig } from "vitest/config";
import tsconfigPaths    from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    /**
     * include パターン。
     * デフォルト（*.test.ts / *.spec.ts）に加えて
     * *-test.ts 形式のファイルも検出できるよう追加する。
     *
     * これにより cfop-solver-test.ts が認識される。
     */
    include: [
      "**/*.{test,spec}.?(c|m)[jt]s?(x)",  // デフォルトパターン（維持）
      "**/*-test.[jt]s",                    // *-test.ts 形式を追加
    ],
    /**
     * node_modules などは除外する（デフォルトと同じ）。
     */
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
    ],
  },
});