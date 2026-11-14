import { defineConfig, devices } from "@playwright/test";

// Runs the browser test against a running copy of the app: `npm run dev` by
// default, or any deployed copy when E2E_BASE_URL is set.
export default defineConfig({
  testDir: "test/e2e",
  timeout: 60_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3410", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
