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
