import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:3010", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    env: { OAUTH_ORIGIN: "https://workspace.example.test", DISCORD_ID: "test-discord-client", DISCORD_SECRET: "test-discord-secret" },
    command: "bun run dev --host 127.0.0.1 --port 3010",
    url: "http://localhost:3010/dashboard",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
