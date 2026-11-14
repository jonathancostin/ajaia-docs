import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { type DocumentRow, requireAccess, type Role } from "../access.ts";
import { contentSchema, EMPTY_DOCUMENT, MAX_CONTENT_BYTES } from "../content.ts";
import type { Db } from "../db/client.ts";
import { documentShares, documents, documentStates, documentVersions, users } from "../db/schema.ts";
import { HttpError } from "../errors.ts";
import { DEFAULT_TITLE, MAX_TITLE_LENGTH } from "../room.ts";
import { type AppEnv, requireUser } from "../session.ts";
import { jsonBody } from "../validate.ts";
import { roomFor } from "./collab.ts";

const title = z
  .string()
  .trim()
  .min(1, "Give the document a title.")
  .max(MAX_TITLE_LENGTH, "Titles can be up to 200 characters.");

const createBody = z.object({ title: title.optional(), content: contentSchema.optional() });

const shareBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ message: "Enter a valid email address." })),
  role: z.enum(["viewer", "editor"], { message: "Choose view or edit access." }),
});

const person = { id: users.id, email: users.email, name: users.name };

const shareCount = sql<number>`(select count(*) from ${documentShares} where ${documentShares.documentId} = ${documents.id})`;

/** The document as the API returns it, without its content. */
export async function toMeta(db: Db, document: DocumentRow, role: Role) {
  const people = await db
    .select(person)
    .from(users)
    .where(inArray(users.id, [document.ownerId, document.updatedBy ?? document.ownerId]));
  const owner = people.find((p) => p.id === document.ownerId);
  const editor = people.find((p) => p.id === document.updatedBy);
  if (!owner) throw new Error(`document ${document.id} has no owner row`);
  return {
    id: document.id,
    title: document.title,
    role,
    owner,
    shareCount: await db.$count(documentShares, eq(documentShares.documentId, document.id)),
    version: document.version,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    updatedBy: editor ? { id: editor.id, name: editor.name } : null,
  };
}

export const documentRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .use(
    bodyLimit({
      maxSize: MAX_CONTENT_BYTES,
      onError: (c) =>
        c.json({ error: { code: "too_large", message: "This document is too large to save. The limit is 1 MB." } }, 413),
    }),
  )

  .get("/", async (c) => {
    const { db, user } = c.var;
    const owned = await db
      .select({ id: documents.id, title: documents.title, updatedAt: documents.updatedAt, shareCount })
      .from(documents)
      .where(eq(documents.ownerId, user.id))
      .orderBy(desc(documents.updatedAt));
    const shared = await db
      .select({
        id: documents.id,
        title: documents.title,
        updatedAt: documents.updatedAt,
        shareCount,
        role: documentShares.role,
        owner: person,
      })
      .from(documentShares)
      .innerJoin(documents, eq(documents.id, documentShares.documentId))
      .innerJoin(users, eq(users.id, documents.ownerId))
      .where(eq(documentShares.userId, user.id))
      .orderBy(desc(documents.updatedAt));
    return c.json({
      owned: owned.map((row) => ({ ...row, role: "owner" as const, owner: user })),
      shared,
    });
  })

  .post("/", jsonBody(createBody), async (c) => {
    const { db, user } = c.var;
    const body = c.req.valid("json");
    const now = Date.now();
    const content = body.content ?? EMPTY_DOCUMENT;
    const document = await db
      .insert(documents)
      .values({
        id: crypto.randomUUID(),
        ownerId: user.id,
        title: body.title ?? DEFAULT_TITLE,
        content: JSON.stringify(content),
        createdAt: now,
        updatedAt: now,
        updatedBy: user.id,
      })
      .returning()
      .get();
    return c.json({ document: { ...(await toMeta(db, document, "owner")), content } }, 201);
  })

  .get("/:id", async (c) => {
    const { db, user } = c.var;
    const { document, role } = await requireAccess(db, c.req.param("id"), user.id, "read");
    return c.json({ document: { ...(await toMeta(db, document, role)), content: JSON.parse(document.content) } });
  })

  // There is no route that saves content or a title. Edits go through the
  // document's live room (worker/room.ts), which is the only writer of both.

  .delete("/:id", async (c) => {
    const { db, user } = c.var;
    const id = c.req.param("id");
    await requireAccess(db, id, user.id, "delete");
    await db.batch([
      db.delete(documentShares).where(eq(documentShares.documentId, id)),
      db.delete(documentVersions).where(eq(documentVersions.documentId, id)),
      db.delete(documentStates).where(eq(documentStates.documentId, id)),
      db.delete(documents).where(eq(documents.id, id)),
    ]);
    await (await roomFor(c.env, id)).deleted();
    return c.body(null, 204);
  })

  .get("/:id/shares", async (c) => {
    const { db, user } = c.var;
    const { document } = await requireAccess(db, c.req.param("id"), user.id, "read");
    const owner = await db.select(person).from(users).where(eq(users.id, document.ownerId)).get();
    const shares = await db
      .select({ user: person, role: documentShares.role })
      .from(documentShares)
      .innerJoin(users, eq(users.id, documentShares.userId))
      .where(eq(documentShares.documentId, document.id))
      .orderBy(asc(users.name));
    return c.json({ owner, shares });
  })

  // Grants access, or changes the role of someone who already has it.
  .put("/:id/shares", jsonBody(shareBody), async (c) => {
    const { db, user } = c.var;
    const { email, role } = c.req.valid("json");
    const { document } = await requireAccess(db, c.req.param("id"), user.id, "share");
    const target = await db.select(person).from(users).where(eq(users.email, email)).get();
    if (!target) throw new HttpError(400, "invalid", "No one with that email has an account.");
    if (target.id === document.ownerId) throw new HttpError(400, "invalid", "The owner already has full access.");
    await db
      .insert(documentShares)
      .values({ documentId: document.id, userId: target.id, role, createdAt: Date.now() })
      .onConflictDoUpdate({ target: [documentShares.documentId, documentShares.userId], set: { role } });
    // A role change takes effect at once, even for someone with the document open.
    await (await roomFor(c.env, document.id)).accessChanged(target.id);
    return c.json({ share: { user: target, role } });
  })

  .delete("/:id/shares/:userId", async (c) => {
    const { db, user } = c.var;
    const { document } = await requireAccess(db, c.req.param("id"), user.id, "share");
    const userId = c.req.param("userId");
    await db
      .delete(documentShares)
      .where(and(eq(documentShares.documentId, document.id), eq(documentShares.userId, userId)));
    await (await roomFor(c.env, document.id)).accessChanged(userId);
    return c.body(null, 204);
  });
