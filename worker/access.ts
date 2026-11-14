// The only place that decides who may do what to a document.
// Every document route calls requireAccess before it reads or writes.
import { and, eq } from "drizzle-orm";
import type { Db } from "./db/client.ts";
import { documentShares, documents } from "./db/schema.ts";
import { documentNotFound, HttpError } from "./errors.ts";

export type Role = "owner" | "editor" | "viewer";
export type Action = "read" | "write" | "share" | "delete";

const ALLOWED: Record<Action, readonly Role[]> = {
  read: ["owner", "editor", "viewer"],
  write: ["owner", "editor"],
  share: ["owner"],
  delete: ["owner"],
};

const DENIED_MESSAGE: Record<Action, string> = {
  read: "You do not have access to this document.",
  write: "You can view this document but not edit it.",
  share: "Only the owner can change who has access.",
  delete: "Only the owner can delete this document.",
};

export type DocumentRow = typeof documents.$inferSelect;

/** The user's role on a document, or null when they have no access or it does not exist. */
export async function findAccess(
  db: Db,
  documentId: string,
  userId: string,
): Promise<{ document: DocumentRow; role: Role } | null> {
  const row = await db
    .select({ document: documents, shareRole: documentShares.role })
    .from(documents)
    .leftJoin(
      documentShares,
      and(eq(documentShares.documentId, documents.id), eq(documentShares.userId, userId)),
    )
    .where(eq(documents.id, documentId))
    .get();
  if (!row) return null;
  const role: Role | null = row.document.ownerId === userId ? "owner" : row.shareRole;
  return role ? { document: row.document, role } : null;
}

/**
 * Returns the document and the user's role, or throws:
 * 404 when the user has no access at all, 403 when their role does not allow the action.
 */
export async function requireAccess(db: Db, documentId: string, userId: string, action: Action) {
  const access = await findAccess(db, documentId, userId);
  if (!access) throw documentNotFound();
  if (!ALLOWED[action].includes(access.role)) throw new HttpError(403, "forbidden", DENIED_MESSAGE[action]);
  return access;
}
