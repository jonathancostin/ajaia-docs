// Sessions are a signed, httpOnly cookie holding the user id and an expiry.
// Nothing is stored server side, so there is no session table to clean up.
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { createDb, type Db } from "./db/client.ts";
import { users } from "./db/schema.ts";
import { HttpError } from "./errors.ts";

const COOKIE = "session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export type AppEnv = { Bindings: Env; Variables: { db: Db; user: SessionUser } };

export const withDb = createMiddleware<AppEnv>(async (c, next) => {
  c.set("db", createDb(c.env.DB));
  await next();
});

export async function startSession(c: Context<AppEnv>, userId: string) {
  const expires = Date.now() + SESSION_SECONDS * 1000;
  await setSignedCookie(c, COOKIE, `${userId}.${expires}`, c.env.SESSION_SECRET, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_SECONDS,
    // Plain http only happens on localhost during development.
    secure: new URL(c.req.url).protocol === "https:",
  });
}

export const endSession = (c: Context<AppEnv>) => deleteCookie(c, COOKIE, { path: "/" });

/** Rejects the request with 401 unless it carries a valid, unexpired session for a real user. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const unauthenticated = new HttpError(401, "unauthenticated", "Sign in to continue.");
  const value = await getSignedCookie(c, c.env.SESSION_SECRET, COOKIE);
  if (!value) throw unauthenticated;
  const separator = value.lastIndexOf(".");
  const userId = value.slice(0, separator);
  if (Number(value.slice(separator + 1)) < Date.now()) throw unauthenticated;
  const user = await c.var.db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!user) throw unauthenticated;
  c.set("user", user);
  await next();
});
