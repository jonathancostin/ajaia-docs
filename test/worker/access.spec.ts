import { beforeAll, describe, expect, it } from "vitest";
import { type Actor, call, createSharedDocument, paragraph, setUp } from "./helpers.ts";

let cookies: Record<Actor, string | undefined>;
beforeAll(async () => {
  cookies = await setUp();
});

// The access rules, one row per action. Each cell is the status the API must
// return. 404 for a stranger (not 403) so the API never confirms a document exists.
const MATRIX: Record<string, Record<Actor, number>> = {
  "read the document": { owner: 200, editor: 200, viewer: 200, stranger: 404, anonymous: 401 },
  "edit the content": { owner: 200, editor: 200, viewer: 403, stranger: 404, anonymous: 401 },
  "rename it": { owner: 200, editor: 200, viewer: 403, stranger: 404, anonymous: 401 },
  "see who has access": { owner: 200, editor: 200, viewer: 200, stranger: 404, anonymous: 401 },
  "share it": { owner: 200, editor: 403, viewer: 403, stranger: 404, anonymous: 401 },
  "remove a share": { owner: 204, editor: 403, viewer: 403, stranger: 404, anonymous: 401 },
  "delete it": { owner: 204, editor: 403, viewer: 403, stranger: 404, anonymous: 401 },
};

const ATTEMPT: Record<string, (id: string, version: number, cookie?: string) => Promise<Response>> = {
  "read the document": (id, _version, cookie) => call("GET", `/documents/${id}`, { cookie }),
  "edit the content": (id, version, cookie) =>
    call("PATCH", `/documents/${id}`, { cookie, body: { content: paragraph("changed"), baseVersion: version } }),
  "rename it": (id, version, cookie) =>
    call("PATCH", `/documents/${id}`, { cookie, body: { title: "Renamed", baseVersion: version } }),
  "see who has access": (id, _version, cookie) => call("GET", `/documents/${id}/shares`, { cookie }),
  "share it": (id, _version, cookie) =>
    call("PUT", `/documents/${id}/shares`, { cookie, body: { email: "dave@example.com", role: "editor" } }),
  "remove a share": (id, _version, cookie) => call("DELETE", `/documents/${id}/shares/u_carol`, { cookie }),
  "delete it": (id, _version, cookie) => call("DELETE", `/documents/${id}`, { cookie }),
};

describe("access matrix", () => {
  for (const [action, expected] of Object.entries(MATRIX)) {
    for (const actor of Object.keys(expected) as Actor[]) {
      it(`${actor} tries to ${action}: ${expected[actor]}`, async () => {
        const document = await createSharedDocument(cookies.owner);
        const response = await ATTEMPT[action](document.id, document.version, cookies[actor]);
        expect(response.status).toBe(expected[actor]);
      });
    }
  }
});

describe("access rules in practice", () => {
  it("a refused edit changes nothing", async () => {
    const document = await createSharedDocument(cookies.owner);
    for (const actor of ["viewer", "stranger", "anonymous"] as const) {
      await ATTEMPT["edit the content"](document.id, document.version, cookies[actor]);
      await ATTEMPT["delete it"](document.id, document.version, cookies[actor]);
    }
    const after = await call("GET", `/documents/${document.id}`, { cookie: cookies.owner });
    const body = (await after.json()) as { document: { content: unknown; version: number } };
    expect(body.document.content).toEqual(paragraph("original"));
    expect(body.document.version).toBe(document.version);
  });

  it("an editor's change is what the owner reads back", async () => {
    const document = await createSharedDocument(cookies.owner);
    await ATTEMPT["edit the content"](document.id, document.version, cookies.editor);
    const after = await call("GET", `/documents/${document.id}`, { cookie: cookies.owner });
    const body = (await after.json()) as { document: { content: unknown; updatedBy: { name: string } } };
    expect(body.document.content).toEqual(paragraph("changed"));
    expect(body.document.updatedBy.name).toBe("Bob Okafor");
  });

  it("lists a document as owned for the owner, shared for the others, and hides it from a stranger", async () => {
    const document = await createSharedDocument(cookies.owner);
    const listFor = async (actor: Actor) => {
      const response = await call("GET", "/documents", { cookie: cookies[actor] });
      const body = (await response.json()) as Record<"owned" | "shared", { id: string; role: string }[]>;
      return {
        owned: body.owned.find((d) => d.id === document.id)?.role,
        shared: body.shared.find((d) => d.id === document.id)?.role,
      };
    };
    expect(await listFor("owner")).toEqual({ owned: "owner", shared: undefined });
    expect(await listFor("editor")).toEqual({ owned: undefined, shared: "editor" });
    expect(await listFor("viewer")).toEqual({ owned: undefined, shared: "viewer" });
    expect(await listFor("stranger")).toEqual({ owned: undefined, shared: undefined });
  });

  it("takes effect at once when the owner lowers a role or removes a share", async () => {
    const document = await createSharedDocument(cookies.owner);
    await call("PUT", `/documents/${document.id}/shares`, {
      cookie: cookies.owner,
      body: { email: "bob@example.com", role: "viewer" },
    });
    const edit = await ATTEMPT["edit the content"](document.id, document.version, cookies.editor);
    expect(edit.status).toBe(403);

    await call("DELETE", `/documents/${document.id}/shares/u_bob`, { cookie: cookies.owner });
    const read = await ATTEMPT["read the document"](document.id, document.version, cookies.editor);
    expect(read.status).toBe(404);
  });

  it("refuses to share with an unknown email or with the owner", async () => {
    const document = await createSharedDocument(cookies.owner);
    for (const email of ["nobody@example.com", "alice@example.com"]) {
      const response = await call("PUT", `/documents/${document.id}/shares`, {
        cookie: cookies.owner,
        body: { email, role: "editor" },
      });
      expect(response.status).toBe(400);
    }
  });
});

describe("sessions", () => {
  it("rejects a wrong password and a tampered cookie", async () => {
    const wrong = await call("POST", "/auth/login", { body: { email: "alice@example.com", password: "nope" } });
    expect(wrong.status).toBe(401);

    // Swap the user id inside a validly signed cookie: the signature no longer matches.
    const forged = cookies.viewer?.replace("u_carol", "u_alice");
    const me = await call("GET", "/me", { cookie: forged });
    expect(me.status).toBe(401);
  });

  it("refuses a write that another site sends with the owner's cookie", async () => {
    const document = await createSharedDocument(cookies.owner);
    const forged = await call("DELETE", `/documents/${document.id}`, {
      cookie: cookies.owner,
      origin: "https://evil.example",
    });
    expect(forged.status).toBe(403);
    const still = await call("GET", `/documents/${document.id}`, { cookie: cookies.owner });
    expect(still.status).toBe(200);
  });
});
