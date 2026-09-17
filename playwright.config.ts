import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  testIgnore: ["**/.worktrees/**", "**/node_modules/**"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm exec next dev --hostname localhost --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120000,
    // Next dev needs development mode; the validated DB/auth environment is inherited.
    env: { NODE_ENV: "development" },
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
  },
});
