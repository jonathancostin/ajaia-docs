import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { HttpError } from "./errors.ts";
import { authRoutes } from "./routes/auth.ts";
import { collabRoutes } from "./routes/collab.ts";
import { documentRoutes } from "./routes/documents.ts";
import { historyRoutes } from "./routes/history.ts";
import { type AppEnv, withDb } from "./session.ts";

// The Durable Object class behind the DOCUMENT_ROOM binding in wrangler.jsonc.
export { DocumentRoom } from "./room.ts";

// Cloudflare serves the built React app itself. Only /api/* reaches this Worker
// (see run_worker_first in wrangler.jsonc).
const app = new Hono<AppEnv>().basePath("/api");

app.use(csrf());
app.use(withDb);

app.get("/health", async (c) => {
  const row = await c.var.db.get<{ users: number }>(sql`select count(*) as users from users`);
  return c.json({ ok: true, users: row?.users ?? 0 });
});

app.route("/", authRoutes);
app.route("/documents", documentRoutes);
app.route("/documents", historyRoutes);
app.route("/collab", collabRoutes);

app.notFound((c) => c.json({ error: { code: "not_found", message: "There is no API route at this address." } }, 404));

// Every error leaves as { error: { code, message } } so the client has one shape to handle.
app.onError((error, c) => {
  if (error instanceof HttpError) {
    return c.json({ error: { code: error.code, message: error.message }, ...error.extra }, error.status);
  }
  if (error instanceof HTTPException) {
    return c.json({ error: { code: "invalid", message: error.message } }, error.status);
  }
  console.error(error);
  return c.json({ error: { code: "server", message: "Something went wrong on our side. Please try again." } }, 500);
});

export default app;
