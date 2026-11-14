import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

const app = new Hono<{ Bindings: Env }>().basePath("/api");

app.get("/health", async (c) => {
  const db = drizzle(c.env.DB);
  const row = await db.get<{ users: number }>(sql`select count(*) as users from users`);
  return c.json({ ok: true, users: row?.users ?? 0 });
});

export default app;
