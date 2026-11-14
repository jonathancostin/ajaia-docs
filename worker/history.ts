// Version history: when a save replaces a document's state, the old state may
// be kept. Keeping every autosave would bury the useful versions, so a state is
// kept only when it marks a point someone might want back.
import { and, desc, eq, notInArray } from "drizzle-orm";
import type { DocumentRow } from "./access.ts";
import { EMPTY_DOCUMENT } from "./content.ts";
import type { Db } from "./db/client.ts";
import { documentVersions } from "./db/schema.ts";

const CHECKPOINT_MS = 10 * 60 * 1000;
const MAX_VERSIONS = 50;
const EMPTY_CONTENT = JSON.stringify(EMPTY_DOCUMENT);

/**
 * Keeps `previous` (the state about to be replaced) as a version when:
 * - `always` is set (a restore must be undoable), or
 * - a different person is saving than the one who wrote it, or
 * - the newest kept version is more than ten minutes older than it.
 * A brand new empty document is never kept.
 */
export async function keepVersion(db: Db, previous: DocumentRow, savingUserId: string, always = false) {
  if (previous.content === EMPTY_CONTENT) return;
  if (!always && previous.updatedBy === savingUserId) {
    const newest = await db
      .select({ savedAt: documentVersions.savedAt })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, previous.id))
      .orderBy(desc(documentVersions.savedAt))
      .limit(1)
      .get();
    if (newest && previous.updatedAt - newest.savedAt <= CHECKPOINT_MS) return;
  }

  await db.insert(documentVersions).values({
    id: crypto.randomUUID(),
    documentId: previous.id,
    title: previous.title,
    content: previous.content,
    savedBy: previous.updatedBy,
    savedAt: previous.updatedAt,
  });

  const newestIds = db
    .select({ id: documentVersions.id })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, previous.id))
    .orderBy(desc(documentVersions.savedAt))
    .limit(MAX_VERSIONS);
  await db
    .delete(documentVersions)
    .where(and(eq(documentVersions.documentId, previous.id), notInArray(documentVersions.id, newestIds)));
}
