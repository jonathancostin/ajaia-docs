import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { users } from "../db/schema.ts";
import { HttpError } from "../errors.ts";
import { hashPassword, verifyPassword } from "../password.ts";
import { type AppEnv, endSession, requireUser, startSession } from "../session.ts";
import { jsonBody } from "../validate.ts";

const loginBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ message: "Enter a valid email address." })),
  password: z.string().min(1, "Enter your password.").max(200),
});

// Verified when the email is unknown, so a wrong email takes as long as a wrong password.
let decoyHash: Promise<string> | undefined;

export const authRoutes = new Hono<AppEnv>()
  .post("/auth/login", jsonBody(loginBody), async (c) => {
    const { email, password } = c.req.valid("json");
    const user = await c.var.db.select().from(users).where(eq(users.email, email)).get();
    decoyHash ??= hashPassword("not a real password");
    const ok = await verifyPassword(password, user?.passwordHash ?? (await decoyHash));
    if (!user || !ok) throw new HttpError(401, "invalid_credentials", "That email or password is not right.");
    await startSession(c, user.id);
    return c.json({ user: { id: user.id, email: user.email, name: user.name } });
  })
  .post("/auth/logout", (c) => {
    endSession(c);
    return c.body(null, 204);
  })
  .get("/me", requireUser, (c) => c.json({ user: c.var.user }))
  // The share dialog lists people to share with. Every signed-in user can see
  // every other user, which suits an internal tool with a known team.
  .get("/users", requireUser, async (c) => {
    const all = await c.var.db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .orderBy(asc(users.name));
    return c.json({ users: all });
  });
