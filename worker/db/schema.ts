import { customType, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    // TipTap JSON, stored as text. Validated on every write (worker/content.ts).
    content: text("content").notNull(),
    // Goes up by one on every save. Clients send the version they started from,
    // so a save over someone else's newer save is refused instead of lost.
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    updatedBy: text("updated_by").references(() => users.id),
  },
  (t) => [index("documents_owner_idx").on(t.ownerId)],
);

export const documentShares = sqliteTable(
  "document_shares",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: ["viewer", "editor"] }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.userId] }), index("shares_user_idx").on(t.userId)],
);

// Earlier states of a document. A row is written just before a save replaces
// that state (see worker/history.ts for when).
export const documentVersions = sqliteTable(
  "document_versions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    // Who wrote this state and when, copied from the document row it came from.
    savedBy: text("saved_by").references(() => users.id),
    savedAt: integer("saved_at").notNull(),
  },
  (t) => [index("versions_document_idx").on(t.documentId, t.savedAt)],
);

// D1 accepts typed arrays for a BLOB and returns either an ArrayBuffer or an array of numbers.
const bytes = customType<{ data: Uint8Array; driverData: ArrayBuffer | number[] }>({
  dataType: () => "blob",
  fromDriver: (value) => new Uint8Array(value),
});

// The Yjs state behind a document's live room, with the document version it
// belongs to. `documents.content` stays the readable copy that the list,
// history and export use. The room writes both in one transaction.
export const documentStates = sqliteTable("document_states", {
  documentId: text("document_id")
    .primaryKey()
    .references(() => documents.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  state: bytes("state").notNull(),
});

export type ShareRole = "viewer" | "editor";
