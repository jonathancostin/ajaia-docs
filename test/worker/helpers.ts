// Helpers for API tests. Requests go through the real Worker (routing, session
// cookie, validation, access checks) and a real D1 database built from the
// production migrations, including the seeded users.
import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { hashPassword } from "../../worker/password.ts";

const PASSWORD = "ajaia-demo";

export type Actor = "owner" | "editor" | "viewer" | "stranger" | "anonymous";

const EMAILS: Record<Exclude<Actor, "anonymous">, string> = {
  owner: "alice@example.com",
  editor: "bob@example.com",
  viewer: "carol@example.com",
  stranger: "dave@example.com",
};

export const paragraph = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

export function call(
  method: string,
  path: string,
  options: { cookie?: string; body?: unknown; origin?: string } = {},
) {
  // Browsers send Origin on every request that can change something, and the
  // API's CSRF check refuses bodiless writes without a matching one.
  const headers = new Headers({ Origin: options.origin ?? "https://docs.test" });
  if (options.cookie) headers.set("Cookie", options.cookie);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  return exports.default.fetch(
    new Request(`https://docs.test/api${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
  );
}

export async function signIn(email: string, password = PASSWORD) {
  const response = await call("POST", "/auth/login", { body: { email, password } });
  return { response, cookie: response.headers.get("Set-Cookie")?.split(";")[0] };
}

/** Applies the migrations, adds a fourth user with no shares, and signs everyone in. */
export async function setUp(): Promise<Record<Actor, string | undefined>> {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users (id, email, name, password_hash, created_at) VALUES ('u_dave', ?, 'Dave Park', ?, 0)",
  )
    .bind(EMAILS.stranger, await hashPassword(PASSWORD))
    .run();
  const cookies: Record<Actor, string | undefined> = {
    owner: undefined,
    editor: undefined,
    viewer: undefined,
    stranger: undefined,
    anonymous: undefined,
  };
  for (const [actor, email] of Object.entries(EMAILS)) {
    cookies[actor as Actor] = (await signIn(email)).cookie;
  }
  return cookies;
}

/** A new document owned by Alice, shared with Bob as editor and Carol as viewer. Dave gets nothing. */
export async function createSharedDocument(ownerCookie: string | undefined) {
  const created = await call("POST", "/documents", {
    cookie: ownerCookie,
    body: { title: "Quarterly plan", content: paragraph("original") },
  });
  const { document } = (await created.json()) as { document: { id: string; version: number } };
  await call("PUT", `/documents/${document.id}/shares`, {
    cookie: ownerCookie,
    body: { email: EMAILS.editor, role: "editor" },
  });
  await call("PUT", `/documents/${document.id}/shares`, {
    cookie: ownerCookie,
    body: { email: EMAILS.viewer, role: "viewer" },
  });
  return document;
}
