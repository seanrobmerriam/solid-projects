import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:3010", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    env: {
      MINIMAX_API_KEY: "",
      OAUTH_ORIGIN: "https://workspace.example.test", DISCORD_ID: "test-discord-client", DISCORD_SECRET: "test-discord-secret",
      ...(process.env.CI ? {
        NODE_ENV: "production", HOST: "127.0.0.1", PORT: "3010",
        APP_ORIGIN: "http://localhost:3010",
        SESSION_SECRET: "ci-only-session-secret-not-for-production-1234567890"
      } : {})
    },
    command: process.env.CI ? "bun .output/server/index.mjs" : "bun --bun run dev --host 127.0.0.1 --port 3010",
    url: "http://localhost:3010/dashboard",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
