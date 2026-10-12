import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./auth-e2e",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: process.env.AUTH_E2E_URL || "http://127.0.0.1:5174",
    headless: true,
    channel: "msedge",
  },
  reporter: "list",
});
