// Version history: when a save replaces a document's state, the old state may
// be kept. Keeping every save would bury the useful versions, so a state is
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
 * Keeps `previous` (the state about to be replaced) as a version, and says
 * whether it did. With `always` it is kept: the room passes that for a restore
 * (so it can be undone) and when a new person starts editing. Otherwise it is
 * kept as a checkpoint when the last kept version, or the document's creation,
 * is more than ten minutes older. A brand new empty document is never kept.
 */
export async function keepVersion(db: Db, previous: DocumentRow, always: boolean): Promise<boolean> {
  if (previous.content === EMPTY_CONTENT) return false;
  if (!always) {
    const newest = await db
      .select({ savedAt: documentVersions.savedAt })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, previous.id))
      .orderBy(desc(documentVersions.savedAt))
      .limit(1)
      .get();
    if (previous.updatedAt - (newest?.savedAt ?? previous.createdAt) <= CHECKPOINT_MS) return false;
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
  return true;
}
