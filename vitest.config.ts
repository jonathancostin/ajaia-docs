import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    test: {
      projects: [
        {
          // API tests run inside the Workers runtime against a real D1 database
          // built from the same migrations production uses.
          plugins: [
            cloudflareTest({
              wrangler: { configPath: "./wrangler.jsonc" },
              miniflare: {
                bindings: { TEST_MIGRATIONS: migrations, SESSION_SECRET: "test-secret" },
              },
            }),
          ],
          test: { name: "worker", include: ["test/worker/**/*.spec.ts"] },
        },
        {
          // File import and export are plain functions. They run in Node with a DOM.
          test: { name: "lib", environment: "happy-dom", include: ["test/lib/**/*.spec.ts"] },
        },
        {
          // UI wiring and the agent bridge, rendered with React in jsdom.
          plugins: [react()],
          test: {
            name: "ui",
            environment: "jsdom",
            include: ["test/ui/**/*.spec.tsx"],
            setupFiles: ["test/ui/setup.ts"],
          },
        },
      ],
    },
  };
});
