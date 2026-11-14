import { beforeAll, describe, expect, it } from "vitest";
import { type Actor, call, createSharedDocument, paragraph, setUp } from "./helpers.ts";

let cookies: Record<Actor, string | undefined>;
beforeAll(async () => {
  cookies = await setUp();
});

describe("saving", () => {
  it("keeps formatting exactly as the editor sent it", async () => {
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
    const reopened = await call("GET", `/documents/${document.id}`, { cookie: cookies.owner });
    expect(((await reopened.json()) as { document: { content: unknown } }).document.content).toEqual(content);
  });

  it("refuses a save that started from an older version, unless forced", async () => {
    const document = await createSharedDocument(cookies.owner);
    const save = (actor: Actor, text: string, extra: object = {}) =>
      call("PATCH", `/documents/${document.id}`, {
        cookie: cookies[actor],
        body: { content: paragraph(text), baseVersion: document.version, ...extra },
      });

    expect((await save("editor", "from Bob")).status).toBe(200);

    const stale = await save("owner", "from Alice");
    expect(stale.status).toBe(409);
    const conflict = (await stale.json()) as { current: { version: number; updatedBy: { name: string } } };
    expect(conflict.current.version).toBe(document.version + 1);
    expect(conflict.current.updatedBy.name).toBe("Bob Okafor");

    const read = async () => {
      const response = await call("GET", `/documents/${document.id}`, { cookie: cookies.owner });
      return ((await response.json()) as { document: { content: unknown } }).document.content;
    };
    expect(await read()).toEqual(paragraph("from Bob"));

    expect((await save("owner", "from Alice", { force: true })).status).toBe(200);
    expect(await read()).toEqual(paragraph("from Alice"));
  });
});

describe("version history", () => {
  const save = (id: string, actor: Actor, text: string) =>
    call("PATCH", `/documents/${id}`, { cookie: cookies[actor], body: { content: paragraph(text), baseVersion: 1, force: true } });
  const history = async (id: string) => {
    const response = await call("GET", `/documents/${id}/versions`, { cookie: cookies.owner });
    return ((await response.json()) as { versions: { id: string; savedBy: { name: string } }[] }).versions;
  };
  const contentOf = async (path: string) => {
    const response = await call("GET", path, { cookie: cookies.owner });
    const body = (await response.json()) as Record<string, { content: unknown }>;
    return (body.document ?? body.version).content;
  };

  it("keeps what one person wrote when another takes over, but not every autosave", async () => {
    const document = await createSharedDocument(cookies.owner);
    await save(document.id, "editor", "Bob, first save");
    await save(document.id, "editor", "Bob, a second later");
    await save(document.id, "editor", "Bob, and again");

    const versions = await history(document.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].savedBy.name).toBe("Alice Nguyen");
    expect(await contentOf(`/documents/${document.id}/versions/${versions[0].id}`)).toEqual(paragraph("original"));
  });

  it("restores an old version and keeps the replaced one, so a restore can be undone", async () => {
    const document = await createSharedDocument(cookies.owner);
    await save(document.id, "editor", "Bob's rewrite");
    const [original] = await history(document.id);

    const restore = await call("POST", `/documents/${document.id}/versions/${original.id}/restore`, {
      cookie: cookies.owner,
    });
    expect(restore.status).toBe(200);
    expect(await contentOf(`/documents/${document.id}`)).toEqual(paragraph("original"));

    const [replaced] = await history(document.id);
    expect(replaced.savedBy.name).toBe("Bob Okafor");
    expect(await contentOf(`/documents/${document.id}/versions/${replaced.id}`)).toEqual(paragraph("Bob's rewrite"));
  });

  it("does not serve one document's version through another document", async () => {
    const first = await createSharedDocument(cookies.owner);
    const second = await createSharedDocument(cookies.owner);
    await save(first.id, "editor", "changed");
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
