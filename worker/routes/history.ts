import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireAccess } from "../access.ts";
import { documentVersions, users } from "../db/schema.ts";
import { documentNotFound, HttpError } from "../errors.ts";
import { type AppEnv, requireUser } from "../session.ts";
import { roomFor } from "./collab.ts";
import { toMeta } from "./documents.ts";

const summary = {
  id: documentVersions.id,
  title: documentVersions.title,
  savedAt: documentVersions.savedAt,
  savedBy: { id: users.id, name: users.name },
};

export const historyRoutes = new Hono<AppEnv>()
  .use(requireUser)

  .get("/:id/versions", async (c) => {
    const { db, user } = c.var;
    const { document } = await requireAccess(db, c.req.param("id"), user.id, "read");
    const versions = await db
      .select(summary)
      .from(documentVersions)
      .leftJoin(users, eq(users.id, documentVersions.savedBy))
      .where(eq(documentVersions.documentId, document.id))
      .orderBy(desc(documentVersions.savedAt));
    return c.json({ versions });
  })

  .get("/:id/versions/:versionId", async (c) => {
    const { db, user } = c.var;
    const { document } = await requireAccess(db, c.req.param("id"), user.id, "read");
    // The document id is part of the lookup, so a version id from another
    // document cannot be read through a document the user does have access to.
    const version = await db
      .select({ ...summary, content: documentVersions.content })
      .from(documentVersions)
      .leftJoin(users, eq(users.id, documentVersions.savedBy))
      .where(and(eq(documentVersions.id, c.req.param("versionId")), eq(documentVersions.documentId, document.id)))
      .get();
    if (!version) throw new HttpError(404, "not_found", "That version no longer exists.");
    return c.json({ version: { ...version, content: JSON.parse(version.content) } });
  })

  .post("/:id/versions/:versionId/restore", async (c) => {
    const { db, user } = c.var;
    const { document, role } = await requireAccess(db, c.req.param("id"), user.id, "write");
    const version = await db
      .select()
      .from(documentVersions)
      .where(and(eq(documentVersions.id, c.req.param("versionId")), eq(documentVersions.documentId, document.id)))
      .get();
    if (!version) throw new HttpError(404, "not_found", "That version no longer exists.");

    // The room does the restore: it saves what anyone was still typing, keeps
    // that state as a version so the restore can be undone, then shows the
    // restored content to everyone who has the document open.
    const room = await roomFor(c.env, document.id);
    const restored = await room.restore({ title: version.title, content: JSON.parse(version.content) }, user.id);
    if (!restored) throw documentNotFound();
    return c.json({ document: { ...(await toMeta(db, restored, role)), content: JSON.parse(restored.content) } });
  });
