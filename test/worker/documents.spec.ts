import { abortAllDurableObjects } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { type Actor, call, createSharedDocument, paragraph, setUp } from "./helpers.ts";
import { openRoom } from "./live.ts";

let cookies: Record<Actor, string | undefined>;
beforeAll(async () => {
  cookies = await setUp();
});

const stored = async (id: string) => {
  const response = await call("GET", `/documents/${id}`, { cookie: cookies.owner });
  return ((await response.json()) as { document: { content: unknown; version: number } }).document;
};

interface ContentNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: ContentNode[];
}

/** Every node in order, with the formatting a reader would see: heading levels, marks and link targets. */
const formatting = (node: ContentNode): string[] => {
  const marks = (node.marks ?? []).map((mark) => (mark.type === "link" ? `link ${mark.attrs?.href}` : mark.type));
  const self =
    node.type === "text"
      ? `"${node.text}" ${marks.sort().join("+")}`.trim()
      : node.type === "heading"
        ? `heading ${node.attrs?.level}`
        : node.type;
  return [self, ...(node.content ?? []).flatMap(formatting)];
};

describe("saving", () => {
  it("keeps every kind of formatting through a live edit and a save", async () => {
    const content = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Plan" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: " and " },
            { type: "text", text: "underlined italic", marks: [{ type: "underline" }, { type: "italic" }] },
            { type: "text", text: "link", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
          ],
        },
        {
          type: "orderedList",
          attrs: { start: 1 },
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
          ],
        },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }] },
          ],
        },
      ],
    };
    const created = await call("POST", "/documents", { cookie: cookies.owner, body: { title: "Formats", content } });
    expect(created.status).toBe(201);
    const { document } = (await created.json()) as { document: { id: string } };

    // The room turns the stored document into its shared form and back when it saves.
    const alice = await openRoom(document.id, cookies.owner);
    alice.type("added later");
    await alice.saved();

    const saved = (await stored(document.id)).content as ContentNode;
    expect(formatting(saved)).toEqual([...formatting(content), "paragraph", '"added later"']);
  });
});

describe("live editing", () => {
  it("shows each person the other's edits and saves the merged result", async () => {
    const document = await createSharedDocument(cookies.owner);
    const alice = await openRoom(document.id, cookies.owner);
    const bob = await openRoom(document.id, cookies.editor);
    expect(alice.text()).toContain("original");
    expect(bob.title()).toBe("Quarterly plan");

    // Both type at the same moment, before either has seen the other's edit.
    alice.type("Alice's line");
    bob.type("Bob's line");
    await alice.roundTrip();
    await bob.roundTrip();
    await alice.roundTrip();

    for (const person of [alice, bob]) {
      expect(person.text()).toContain("Alice's line");
      expect(person.text()).toContain("Bob's line");
    }
    expect(alice.text()).toBe(bob.text());

    await bob.saved();
    const saved = JSON.stringify((await stored(document.id)).content);
    expect(saved).toContain("original");
    expect(saved).toContain("Alice's line");
    expect(saved).toContain("Bob's line");
  });

  it("tells everyone in the room when the document was saved, and by whom", async () => {
    const document = await createSharedDocument(cookies.owner);
    const alice = await openRoom(document.id, cookies.owner);
    const carol = await openRoom(document.id, cookies.viewer);
    alice.type("something new");
    await alice.saved();
    await carol.roundTrip();

    expect(carol.messages.at(-1)).toMatchObject({
      type: "saved",
      version: document.version + 1,
      updatedBy: { name: "Alice Nguyen" },
    });
  });

  it("does not save or count a change when someone only opens the document", async () => {
    const document = await createSharedDocument(cookies.owner);
    const bob = await openRoom(document.id, cookies.editor);
    await bob.saved();
    bob.close();
    expect((await stored(document.id)).version).toBe(document.version);
  });

  it("never saves content the editor does not support, and says so", async () => {
    const document = await createSharedDocument(cookies.owner);
    const bob = await openRoom(document.id, cookies.editor);
    bob.insert("image", { src: "https://example.com/tracker.png" });
    const message = await bob.saved();

    expect(message?.type).toBe("save-failed");
    expect(await stored(document.id)).toMatchObject({ content: paragraph("original"), version: document.version });
  });

  it("keeps its state when the room shuts down, so a client that was offline merges without duplicating text", async () => {
    const document = await createSharedDocument(cookies.owner);
    const alice = await openRoom(document.id, cookies.owner);
    alice.type("written before the restart");
    await alice.saved();

    // The room is evicted from memory, as Cloudflare does to idle rooms. Alice's
    // tab still holds its copy, and reconnects with it.
    await abortAllDurableObjects();
    const aliceAgain = await openRoom(document.id, cookies.owner, {}, alice.doc);
    aliceAgain.type("written after the restart");
    await aliceAgain.saved();

    // Each line is there once. A room that rebuilt its state from the stored
    // text would have merged Alice's copy in as new text and doubled it.
    const saved = JSON.stringify((await stored(document.id)).content);
    expect(saved.split("original")).toHaveLength(2);
    expect(saved.split("written before the restart")).toHaveLength(2);
    expect(saved.split("written after the restart")).toHaveLength(2);
  });
});

describe("version history", () => {
  const edit = async (id: string, actor: Actor, text: string) => {
    const person = await openRoom(id, cookies[actor]);
    person.type(text);
    await person.saved();
    return person;
  };
  const history = async (id: string) => {
    const response = await call("GET", `/documents/${id}/versions`, { cookie: cookies.owner });
    return ((await response.json()) as { versions: { id: string; savedBy: { name: string } }[] }).versions;
  };
  const contentOf = async (path: string) => {
    const response = await call("GET", path, { cookie: cookies.owner });
    const body = (await response.json()) as Record<string, { content: unknown }>;
    return JSON.stringify((body.document ?? body.version).content);
  };

  it("keeps what one person wrote when another starts editing, but not every save", async () => {
    const document = await createSharedDocument(cookies.owner);
    const bob = await edit(document.id, "editor", "Bob, first save");
    bob.type("Bob, a second later");
    await bob.saved();
    bob.type("Bob, and again");
    await bob.saved();

    const versions = await history(document.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].savedBy.name).toBe("Alice Nguyen");
    expect(JSON.parse(await contentOf(`/documents/${document.id}/versions/${versions[0].id}`))).toEqual(
      paragraph("original"),
    );
  });

  it("keeps one version, not one per save, while two people type in turn", async () => {
    const document = await createSharedDocument(cookies.owner);
    const bob = await edit(document.id, "editor", "Bob 1");
    const alice = await edit(document.id, "owner", "Alice 1");
    for (const round of [2, 3, 4]) {
      bob.type(`Bob ${round}`);
      await bob.saved();
      alice.type(`Alice ${round}`);
      await alice.saved();
    }
    expect(await history(document.id)).toHaveLength(1);
  });

  it("restores an old version for everyone who has the document open, and the restore can be undone", async () => {
    const document = await createSharedDocument(cookies.owner);
    const bob = await edit(document.id, "editor", "Bob's rewrite");
    const [original] = await history(document.id);

    const restore = await call("POST", `/documents/${document.id}/versions/${original.id}/restore`, {
      cookie: cookies.owner,
    });
    expect(restore.status).toBe(200);
    expect(JSON.parse(await contentOf(`/documents/${document.id}`))).toEqual(paragraph("original"));

    // Bob still has the document open. His copy changes without a reload.
    await bob.roundTrip();
    expect(bob.text()).not.toContain("Bob's rewrite");
    expect(bob.text()).toContain("original");

    const [replaced] = await history(document.id);
    expect(replaced.savedBy.name).toBe("Bob Okafor");
    expect(await contentOf(`/documents/${document.id}/versions/${replaced.id}`)).toContain("Bob's rewrite");
  });

  it("does not serve one document's version through another document", async () => {
    const first = await createSharedDocument(cookies.owner);
    const second = await createSharedDocument(cookies.owner);
    await edit(first.id, "editor", "changed");
    const [version] = await history(first.id);

    const read = await call("GET", `/documents/${second.id}/versions/${version.id}`, { cookie: cookies.owner });
    expect(read.status).toBe(404);
    const restore = await call("POST", `/documents/${second.id}/versions/${version.id}/restore`, {
      cookie: cookies.owner,
    });
    expect(restore.status).toBe(404);
  });
});

describe("content validation", () => {
  const create = (body: unknown) => call("POST", "/documents", { cookie: cookies.owner, body });
  const withNode = (node: unknown) => ({ title: "x", content: { type: "doc", content: [node] } });
  const withMark = (mark: unknown) =>
    withNode({ type: "paragraph", content: [{ type: "text", text: "x", marks: [mark] }] });

  it.each([
    ["a node type the editor does not have", withNode({ type: "image", attrs: { src: "https://example.com/x.png" } })],
    ["raw HTML smuggled in as a node", withNode({ type: "html", text: "<script>alert(1)</script>" })],
    ["a javascript: link", withMark({ type: "link", attrs: { href: "javascript:alert(1)" } })],
    ["an unknown mark", withMark({ type: "textStyle", attrs: { color: "red" } })],
    ["a heading level outside 1 to 3", withNode({ type: "heading", attrs: { level: 6 } })],
    ["content that is not a doc", { title: "x", content: { type: "paragraph" } }],
    ["an empty title", { title: "   " }],
    ["a title over 200 characters", { title: "t".repeat(201) }],
  ])("rejects %s", async (_name, body) => {
    const response = await create(body);
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("invalid");
  });

  it("rejects a body over 1 MB", async () => {
    const response = await create({ title: "big", content: paragraph("x".repeat(1024 * 1024)) });
    expect(response.status).toBe(413);
  });

  it("rejects content nested deeper than any real document", async () => {
    let node: object = { type: "paragraph" };
    for (let i = 0; i < 200; i++) node = { type: "blockquote", content: [node] };
    expect((await create(withNode(node))).status).toBe(400);
  });
});
