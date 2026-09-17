import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname), "server-only": path.resolve(__dirname, "tests/support/server-only.ts") } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.worktrees/**", "**/.next/**"],
    passWithNoTests: false,
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000,
    setupFiles: ["./tests/setup.ts"],
  },
});
