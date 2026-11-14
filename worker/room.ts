// One live room per document: a Durable Object that holds the shared Yjs
// document, relays edits and cursors between everyone who has it open, and is
// the only writer of the document's title and content in the database.
//
// Nobody reaches a room directly. The Worker checks the session and the user's
// role (worker/routes/collab.ts), then forwards the socket with that role
// attached. The room trusts the role it is given and nothing the client sends.
import { getSchema } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import { eq } from "drizzle-orm";
import type { Connection, ConnectionContext } from "partyserver";
import { YServer } from "y-partyserver";
import { applyUpdate, encodeStateAsUpdate } from "yjs";
import { COLLAB_FIELD, COLLAB_META, editorExtensions } from "../src/lib/extensions.ts";
import type { DocumentRow, Role } from "./access.ts";
import { contentSchema, MAX_CONTENT_BYTES } from "./content.ts";
import { createDb } from "./db/client.ts";
import { documents, documentStates, users } from "./db/schema.ts";
import { keepVersion } from "./history.ts";

export const MEMBER_HEADER = "x-ajaia-member";
export const MAX_TITLE_LENGTH = 200;
export const DEFAULT_TITLE = "Untitled document";

/** Socket close codes the client acts on. */
export const CLOSE_ACCESS_CHANGED = 4403;
export const CLOSE_DELETED = 4404;

/** Who a socket belongs to, as decided by the Worker. */
export interface Member {
  userId: string;
  role: Role;
}

// Changes that come from the database, not from a person. They do not need saving.
const FROM_DATABASE = Symbol("from database");

let schema: Schema | undefined;
// Built on first use, not at startup, so requests that never open a room do not pay for it.
const documentSchema = () => (schema ??= getSchema(editorExtensions));

/** The same content with default attributes filled in and keys in a fixed order, so two copies can be compared. */
const canonical = (content: unknown) => JSON.stringify(documentSchema().nodeFromJSON(content).toJSON());

const memberOf = (origin: unknown): Member | null => {
  if (!origin || typeof origin !== "object" || !("state" in origin)) return null;
  const state = origin.state;
  return state && typeof state === "object" && "userId" in state ? (state as Member) : null;
};

export class DocumentRoom extends YServer {
  // Save one second after edits stop, and at least every five seconds while they continue.
  static callbackOptions = { debounceWait: 1000, debounceMaxWait: 5000 };

  #db = createDb(this.env.DB);
  /** The `documents.version` this room's state matches. */
  #version = 0;
  #dirty = false;
  #lastEditor: string | null = null;
  /** People who have edited since the last version was kept. Decides when a new editor triggers one. */
  #contributors = new Set<string>();
  #queue: Promise<unknown> = Promise.resolve();

  get #fragment() {
    return this.document.getXmlFragment(COLLAB_FIELD);
  }

  get #meta() {
    return this.document.getMap<string>(COLLAB_META);
  }

  async onLoad() {
    const row = await this.#db.select().from(documents).where(eq(documents.id, this.name)).get();
    if (!row) return;
    const saved = await this.#db.select().from(documentStates).where(eq(documentStates.documentId, row.id)).get();
    // Reusing the saved Yjs state matters: a client that was offline can then
    // merge its changes. A state rebuilt from JSON would duplicate the text.
    if (saved?.version === row.version) applyUpdate(this.document, saved.state, FROM_DATABASE);
    else this.#replace(row.title, JSON.parse(row.content), FROM_DATABASE);
    this.#version = row.version;
  }

  async onStart() {
    await super.onStart();
    this.document.on("update", (_update: Uint8Array, origin: unknown) => {
      if (origin === FROM_DATABASE) return;
      this.#dirty = true;
      this.#lastEditor = memberOf(origin)?.userId ?? this.#lastEditor;
    });
  }

  async onConnect(connection: Connection, context: ConnectionContext) {
    connection.setState(JSON.parse(context.request.headers.get(MEMBER_HEADER) ?? "null") as Member | null);
    if ([...this.getConnections()].length <= 1) await this.#reloadIfChangedElsewhere();
    super.onConnect(connection, context);
  }

  /** Edits from anyone but the owner or an editor are dropped before they touch the document. */
  isReadOnly(connection: Connection) {
    const role = memberOf(connection)?.role;
    return role !== "owner" && role !== "editor";
  }

  async onClose(connection: Connection, code: number, reason: string, wasClean: boolean) {
    super.onClose(connection, code, reason, wasClean);
    if ([...this.getConnections()].some((other) => other.id !== connection.id)) return;
    // The last person left. Save now, because the room may be shut down before the timer fires.
    await this.flush();
    this.#contributors.clear();
  }

  onSave() {
    return this.flush();
  }

  /** Writes pending edits to the database now. */
  async flush() {
    await this.#inOrder(() => this.#write(false));
  }

  /** Puts an earlier version back for everyone in the room and saves it. Returns the saved document. */
  async restore(version: { title: string; content: unknown }, userId: string): Promise<DocumentRow | null> {
    await this.__unsafe_ensureInitialized();
    return this.#inOrder(async () => {
      await this.#write(false);
      this.#replace(version.title, version.content, null);
      this.#lastEditor = userId;
      return this.#write(true);
    });
  }

  /** Disconnects a person whose role changed or was removed. Their client reconnects with the new role. */
  async accessChanged(userId: string) {
    for (const connection of this.getConnections()) {
      if (memberOf(connection)?.userId === userId) connection.close(CLOSE_ACCESS_CHANGED, "Your access changed.");
    }
  }

  /** Disconnects everyone because the document was deleted. */
  async deleted() {
    this.#dirty = false;
    for (const connection of this.getConnections()) connection.close(CLOSE_DELETED, "This document was deleted.");
  }

  #replace(title: string, content: unknown, origin: unknown) {
    this.document.transact(() => {
      // Updates the shared document to match, changing only what differs.
      prosemirrorJSONToYXmlFragment(documentSchema(), content, this.#fragment);
      this.#meta.set("title", title);
    }, origin);
  }

  /** If the database row changed without this room (a demo reset), take the row's content. */
  async #reloadIfChangedElsewhere() {
    if (this.#dirty) return;
    const row = await this.#db.select().from(documents).where(eq(documents.id, this.name)).get();
    if (!row || row.version === this.#version) return;
    this.#replace(row.title, JSON.parse(row.content), FROM_DATABASE);
    this.#version = row.version;
  }

  /** Runs saves one after another, so two can never interleave their reads and writes. */
  #inOrder<T>(task: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(task);
    this.#queue = result.catch((error: unknown) => console.error("room save failed", error));
    return result;
  }

  async #write(keepPrevious: boolean): Promise<DocumentRow | null> {
    if (!this.#dirty && !keepPrevious) return null;
    const previous = await this.#db.select().from(documents).where(eq(documents.id, this.name)).get();
    if (!previous) return null;

    // The room validates like the API does. Content the editor does not
    // support is never written, whatever a client put in the shared document.
    let content: string;
    try {
      content = canonical(contentSchema.parse(yXmlFragmentToProsemirrorJSON(this.#fragment)));
      if (content.length > MAX_CONTENT_BYTES) throw new Error("too large");
    } catch {
      this.broadcastCustomMessage(
        JSON.stringify({ type: "save-failed", message: "This document has content that cannot be saved." }),
      );
      return null;
    }
    const title = (this.#meta.get("title") ?? "").trim().slice(0, MAX_TITLE_LENGTH) || DEFAULT_TITLE;
    this.#dirty = false;

    const by = this.#lastEditor ?? previous.updatedBy ?? previous.ownerId;
    let saved = previous;
    if (content !== canonical(JSON.parse(previous.content)) || title !== previous.title) {
      // Keep the old state when someone who has not edited since the last
      // kept version starts editing. Two people typing in turn then produce
      // one version, not one per save.
      const newEditor = by !== previous.updatedBy && !this.#contributors.has(by);
      const kept = await keepVersion(this.#db, previous, keepPrevious || newEditor);
      if (kept) this.#contributors.clear();
      if (previous.updatedBy) this.#contributors.add(previous.updatedBy);
      this.#contributors.add(by);

      saved = { ...previous, title, content, version: previous.version + 1, updatedAt: Date.now(), updatedBy: by };
      const state = { documentId: saved.id, version: saved.version, state: encodeStateAsUpdate(this.document) };
      try {
        await this.#db.batch([
          this.#db
            .update(documents)
            .set({ title, content, version: saved.version, updatedAt: saved.updatedAt, updatedBy: by })
            .where(eq(documents.id, saved.id)),
          this.#db
            .insert(documentStates)
            .values(state)
            .onConflictDoUpdate({ target: documentStates.documentId, set: state }),
        ]);
      } catch (error) {
        this.#dirty = true;
        throw error;
      }
      this.#version = saved.version;
    }

    const editor = saved.updatedBy
      ? await this.#db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, saved.updatedBy)).get()
      : null;
    this.broadcastCustomMessage(
      JSON.stringify({ type: "saved", version: saved.version, updatedAt: saved.updatedAt, updatedBy: editor ?? null }),
    );
    return saved;
  }
}
