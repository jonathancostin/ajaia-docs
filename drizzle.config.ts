import { defineConfig } from "drizzle-kit";

// Only used to generate SQL migrations from the schema: `npm run db:generate`.
// Wrangler applies them, locally and in production.
export default defineConfig({
  dialect: "sqlite",
  schema: "./worker/db/schema.ts",
  out: "./migrations",
});
