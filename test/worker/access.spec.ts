import { beforeAll, describe, expect, it } from "vitest";
import { type Actor, call, createSharedDocument, paragraph, setUp } from "./helpers.ts";
import { connect, openRoom } from "./live.ts";

let cookies: Record<Actor, string | undefined>;
beforeAll(async () => {
  cookies = await setUp();
});

// The access rules, one row per action. Each cell is the status the API must
// return. 404 for a stranger (not 403) so the API never confirms a document exists.
// 101 means the live editing socket opened. What each role can do once it is
// open is tested below and in live.spec.ts.
const MATRIX: Record<string, Record<Actor, number>> = {
  "read the document": { owner: 200, editor: 200, viewer: 200, stranger: 404, anonymous: 401 },
  "open it for live editing": { owner: 101, editor: 101, viewer: 101, stranger: 404, anonymous: 401 },
  "see who has access": { owner: 200, editor: 200, viewer: 200, stranger: 404, anonymous: 401 },
  "share it": { owner: 200, editor: 403, viewer: 403, stranger: 404, anonymous: 401 },
  "remove a share": { owner: 204, editor: 403, viewer: 403, stranger: 404, anonymous: 401 },
  "delete it": { owner: 204, editor: 403, viewer: 403, stranger: 404, anonymous: 401 },
  "see the version history": { owner: 200, editor: 200, viewer: 200, stranger: 404, anonymous: 401 },
  "read an old version": { owner: 200, editor: 200, viewer: 200, stranger: 404, anonymous: 401 },
  "restore an old version": { owner: 200, editor: 200, viewer: 403, stranger: 404, anonymous: 401 },
};

/** Has the editor change the document, which keeps the owner's original as a version, and returns that version's id. */
async function olderVersionId(id: string) {
  const bob = await openRoom(id, cookies.editor);
  bob.type("second draft");
  await bob.saved();
  bob.close();
  const response = await call("GET", `/documents/${id}/versions`, { cookie: cookies.owner });
  const { versions } = (await response.json()) as { versions: { id: string }[] };
  return versions[0].id;
}

const ATTEMPT: Record<string, (id: string, cookie?: string) => Promise<Response>> = {
  "read the document": (id, cookie) => call("GET", `/documents/${id}`, { cookie }),
  "open it for live editing": async (id, cookie) => {
    const response = await connect(id, cookie);
    response.webSocket?.accept();
    response.webSocket?.close(1000, "done");
    return response;
  },
  "see who has access": (id, cookie) => call("GET", `/documents/${id}/shares`, { cookie }),
  "share it": (id, cookie) =>
    call("PUT", `/documents/${id}/shares`, { cookie, body: { email: "dave@example.com", role: "editor" } }),
  "remove a share": (id, cookie) => call("DELETE", `/documents/${id}/shares/u_carol`, { cookie }),
  "delete it": (id, cookie) => call("DELETE", `/documents/${id}`, { cookie }),
  "see the version history": (id, cookie) => call("GET", `/documents/${id}/versions`, { cookie }),
  "read an old version": async (id, cookie) =>
    call("GET", `/documents/${id}/versions/${await olderVersionId(id)}`, { cookie }),
  "restore an old version": async (id, cookie) =>
    call("POST", `/documents/${id}/versions/${await olderVersionId(id)}/restore`, { cookie }),
};

const stored = async (id: string) => {
  const response = await call("GET", `/documents/${id}`, { cookie: cookies.owner });
  const body = (await response.json()) as {
    document: { title: string; content: unknown; version: number; updatedBy: { name: string } };
  };
  return body.document;
};

describe("access matrix", () => {
  for (const [action, expected] of Object.entries(MATRIX)) {
    for (const actor of Object.keys(expected) as Actor[]) {
      it(`${actor} tries to ${action}: ${expected[actor]}`, async () => {
        const document = await createSharedDocument(cookies.owner);
        const response = await ATTEMPT[action](document.id, cookies[actor]);
        expect(response.status).toBe(expected[actor]);
      });
    }
  }
});

describe("access rules in practice", () => {
  it("an editor's change over the socket is what the owner reads back", async () => {
    const document = await createSharedDocument(cookies.owner);
    const bob = await openRoom(document.id, cookies.editor);
    bob.type("changed by Bob");
    bob.rename("Renamed by Bob");
    await bob.saved();

    const after = await stored(document.id);
    expect(after.title).toBe("Renamed by Bob");
    expect(JSON.stringify(after.content)).toContain("changed by Bob");
    expect(after.updatedBy.name).toBe("Bob Okafor");
  });

  it("a viewer's edits over the socket are dropped: nobody else sees them and nothing is saved", async () => {
    const document = await createSharedDocument(cookies.owner);
    const alice = await openRoom(document.id, cookies.owner);
    const carol = await openRoom(document.id, cookies.viewer);

    // Carol's client is modified to send edits anyway.
    carol.type("sneaked in by Carol");
    carol.rename("Carol's title");
    await carol.roundTrip();

    alice.type("written by Alice");
    await alice.saved();
    await carol.roundTrip();

    // Alice never received Carol's edit, and Carol did receive Alice's.
    expect(alice.text()).not.toContain("sneaked in by Carol");
    expect(alice.title()).toBe("Quarterly plan");
    expect(carol.text()).toContain("written by Alice");

    const after = await stored(document.id);
    expect(JSON.stringify(after.content)).not.toContain("sneaked in by Carol");
    expect(JSON.stringify(after.content)).toContain("written by Alice");
    expect(after.title).toBe("Quarterly plan");
    expect(after.updatedBy.name).toBe("Alice Nguyen");
  });

  it("a refused delete or restore changes nothing", async () => {
    const document = await createSharedDocument(cookies.owner);
    const versionId = await olderVersionId(document.id);
    const before = await stored(document.id);
    for (const actor of ["viewer", "stranger", "anonymous"] as const) {
      await call("DELETE", `/documents/${document.id}`, { cookie: cookies[actor] });
      await call("POST", `/documents/${document.id}/versions/${versionId}/restore`, { cookie: cookies[actor] });
    }
    expect(await stored(document.id)).toEqual(before);
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

  it("takes effect at once when the owner lowers a role, even for someone with the document open", async () => {
    const document = await createSharedDocument(cookies.owner);
    const bob = await openRoom(document.id, cookies.editor);
    bob.type("while Bob could edit");
    await bob.saved();

    await call("PUT", `/documents/${document.id}/shares`, {
      cookie: cookies.owner,
      body: { email: "bob@example.com", role: "viewer" },
    });
    // His open socket is closed. The page reconnects, now as a viewer.
    await expect.poll(() => bob.closeCode()).toBe(4403);
    const bobAgain = await openRoom(document.id, cookies.editor);
    bobAgain.type("after Bob became a viewer");
    await bobAgain.roundTrip();

    const alice = await openRoom(document.id, cookies.owner);
    expect(alice.text()).toContain("while Bob could edit");
    expect(alice.text()).not.toContain("after Bob became a viewer");
  });

  it("closes the socket and refuses a new one when the owner removes a share", async () => {
    const document = await createSharedDocument(cookies.owner);
    const bob = await openRoom(document.id, cookies.editor);
    await call("DELETE", `/documents/${document.id}/shares/u_bob`, { cookie: cookies.owner });

    await expect.poll(() => bob.closeCode()).toBe(4403);
    expect((await connect(document.id, cookies.editor)).status).toBe(404);
    expect((await call("GET", `/documents/${document.id}`, { cookie: cookies.editor })).status).toBe(404);
  });

  it("closes every open socket when the owner deletes the document", async () => {
    const document = await createSharedDocument(cookies.owner);
    const bob = await openRoom(document.id, cookies.editor);
    await call("DELETE", `/documents/${document.id}`, { cookie: cookies.owner });
    await expect.poll(() => bob.closeCode()).toBe(4404);
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

  it("refuses a live editing socket opened from another site with the owner's cookie", async () => {
    const document = await createSharedDocument(cookies.owner);
    expect((await connect(document.id, cookies.owner, { Origin: "https://evil.example" })).status).toBe(403);
  });

  it("ignores a role the client claims for itself", async () => {
    const document = await createSharedDocument(cookies.owner);
    // Carol's client sends the header the Worker uses to tell the room who she is.
    const carol = await openRoom(document.id, cookies.viewer, {
      "x-ajaia-member": JSON.stringify({ userId: "u_alice", role: "owner" }),
    });
    carol.type("forged owner");
    await carol.roundTrip();

    const alice = await openRoom(document.id, cookies.owner);
    expect(alice.text()).not.toContain("forged owner");
    expect((await stored(document.id)).content).toEqual(paragraph("original"));
  });
});
