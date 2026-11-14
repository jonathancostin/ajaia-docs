// The door to a document's live room. The same session and access check as
// the rest of the API runs here, before any socket exists.
import { Hono } from "hono";
import { getServerByName } from "partyserver";
import { requireAccess } from "../access.ts";
import { HttpError } from "../errors.ts";
import { type Member, MEMBER_HEADER } from "../room.ts";
import { type AppEnv, requireUser } from "../session.ts";

/** The live room for a document. Used by the routes that must tell the room something changed. */
export const roomFor = (env: Env, documentId: string) => getServerByName(env.DOCUMENT_ROOM, documentId);

export const collabRoutes = new Hono<AppEnv>().get("/:id", requireUser, async (c) => {
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
    throw new HttpError(426, "invalid", "This address only accepts WebSocket connections.");
  }
  // Browsers send Origin on every WebSocket handshake. A page on another
  // site must not be able to open a socket with this user's cookie.
  const origin = c.req.header("Origin");
  if (!origin || new URL(origin).host !== new URL(c.req.url).host) {
    throw new HttpError(403, "forbidden", "This connection came from another site.");
  }

  const { db, user } = c.var;
  // Viewers may connect: they see edits arrive. The room drops anything they send.
  const { document, role } = await requireAccess(db, c.req.param("id"), user.id, "read");

  // Overwrites anything the client put in this header.
  const headers = new Headers(c.req.raw.headers);
  headers.set(MEMBER_HEADER, JSON.stringify({ userId: user.id, role } satisfies Member));
  const room = await roomFor(c.env, document.id);
  return room.fetch(new Request(c.req.raw, { headers }));
});
