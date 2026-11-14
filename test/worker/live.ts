// A small Yjs client for tests. It opens the same socket a browser does,
// through the real Worker and into the real Durable Object, and keeps a local
// copy of the shared document.
import { env, exports } from "cloudflare:workers";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { getServerByName } from "partyserver";
import * as sync from "y-protocols/sync";
import * as Y from "yjs";
import { COLLAB_FIELD, COLLAB_META } from "../../src/lib/extensions.ts";

const SYNC = 0;
const CUSTOM_PREFIX = "__YPS:";

export interface ServerMessage {
  type: "saved" | "save-failed";
  version?: number;
  updatedBy?: { id: string; name: string } | null;
}

export function connect(documentId: string, cookie?: string, extra: Record<string, string> = {}) {
  const headers = new Headers({ Upgrade: "websocket", Origin: "https://docs.test", ...extra });
  if (cookie) headers.set("Cookie", cookie);
  return exports.default.fetch(new Request(`https://docs.test/api/collab/${documentId}`, { headers }));
}

/**
 * Opens a document's live room as the person the cookie belongs to, and waits
 * for its content. Pass `doc` to reconnect with a copy the client already has.
 */
export async function openRoom(
  documentId: string,
  cookie?: string,
  extra: Record<string, string> = {},
  doc = new Y.Doc(),
) {
  const response = await connect(documentId, cookie, extra);
  const socket = response.webSocket;
  if (!socket) throw new Error(`could not open the room: ${response.status}`);

  const messages: ServerMessage[] = [];
  let closeCode: number | undefined;
  let answered = () => {};

  const send = (write: (encoder: encoding.Encoder) => void) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, SYNC);
    write(encoder);
    socket.send(encoding.toUint8Array(encoder));
  };

  socket.addEventListener("close", (event) => {
    closeCode = event.code;
  });
  socket.addEventListener("message", (event) => {
    if (typeof event.data === "string") {
      if (event.data.startsWith(CUSTOM_PREFIX)) messages.push(JSON.parse(event.data.slice(CUSTOM_PREFIX.length)));
      return;
    }
    const decoder = decoding.createDecoder(new Uint8Array(event.data as ArrayBuffer));
    if (decoding.readVarUint(decoder) !== SYNC) return;
    const reply = encoding.createEncoder();
    encoding.writeVarUint(reply, SYNC);
    const kind = sync.readSyncMessage(decoder, reply, doc, socket);
    if (encoding.length(reply) > 1) socket.send(encoding.toUint8Array(reply));
    if (kind === sync.messageYjsSyncStep2) answered();
  });
  doc.on("update", (update: Uint8Array, updateOrigin: unknown) => {
    if (updateOrigin !== socket) send((encoder) => sync.writeUpdate(encoder, update));
  });
  // At this compatibility date a Worker receives binary frames as Blobs unless told otherwise.
  socket.binaryType = "arraybuffer";
  socket.accept();

  /**
   * Asks the room for anything this client is missing and waits for the answer.
   * The room handles a socket's messages in order, so when this returns it has
   * also handled everything this client sent before.
   */
  const roundTrip = () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    answered = resolve;
    send((encoder) => sync.writeSyncStep1(encoder, doc));
    return promise;
  };
  await roundTrip();

  return {
    doc,
    messages,
    roundTrip,
    closeCode: () => closeCode,
    text: () => doc.getXmlFragment(COLLAB_FIELD).toString(),
    title: () => doc.getMap<string>(COLLAB_META).get("title"),
    /** Adds a paragraph at the end, the way an editor would. */
    type(text: string) {
      const paragraph = new Y.XmlElement("paragraph");
      paragraph.insert(0, [new Y.XmlText(text)]);
      doc.getXmlFragment(COLLAB_FIELD).push([paragraph]);
    },
    rename(title: string) {
      doc.getMap<string>(COLLAB_META).set("title", title);
    },
    /** Adds an element of any type, including ones the editor does not have. */
    insert(nodeName: string, attributes: Record<string, string> = {}) {
      const element = new Y.XmlElement(nodeName);
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
      doc.getXmlFragment(COLLAB_FIELD).push([element]);
    },
    /** Waits until the room has taken this client's edits and written them to the database. */
    async saved() {
      await roundTrip();
      const seen = messages.length;
      const room = await getServerByName(env.DOCUMENT_ROOM, documentId);
      await room.flush();
      for (let attempt = 0; attempt < 100 && messages.length === seen; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return messages.at(-1);
    },
    close: () => socket.close(1000, "done"),
  };
}

export type LiveRoom = Awaited<ReturnType<typeof openRoom>>;
