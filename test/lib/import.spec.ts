import { readFileSync } from "node:fs";
import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
  ImportError,
  MAX_IMPORT_BYTES,
  docxToDoc,
  htmlToDoc,
  importFile,
  markdownToDoc,
  textToDoc,
} from "../../src/lib/import";
import { contentSchema } from "../../worker/content";

// Vitest runs from the repo root; import.meta.url is not a file URL under happy-dom.
const fixture = (name: string) => readFileSync(`test/fixtures/${name}`);

function nodes(doc: JSONContent): JSONContent[] {
  return [doc, ...(doc.content ?? []).flatMap(nodes)];
}

function markedText(doc: JSONContent, mark: string): string[] {
  return nodes(doc)
    .filter((node) => node.marks?.some((m) => m.type === mark))
    .map((node) => node.text ?? "");
}

function listItems(doc: JSONContent, listType: string): string[] {
  const list = nodes(doc).find((node) => node.type === listType);
  return (list?.content ?? []).map((item) =>
    nodes(item)
      .map((node) => node.text ?? "")
      .join(""),
  );
}

describe("textToDoc", () => {
  it("splits paragraphs on blank lines and keeps line breaks", () => {
    const doc = textToDoc(fixture("sample.txt").toString("utf8").replace(/\n/g, "\r\n"));
    expect(doc).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Meeting notes" },
            { type: "hardBreak" },
            { type: "text", text: "Tuesday morning" },
          ],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "We agreed to ship the editor first." },
            { type: "hardBreak" },
            { type: "text", text: "Sharing comes next." },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "Questions go to the team channel." }] },
      ],
    });
  });
});

describe("markdownToDoc", () => {
  it("keeps headings, marks, lists and links", () => {
    const doc = markdownToDoc(fixture("sample.md").toString("utf8"));
    const heading = doc.content?.[0];
    expect(heading?.type).toBe("heading");
    expect(heading?.attrs?.level).toBe(1);
    expect(markedText(doc, "bold")).toEqual(["important"]);
    expect(markedText(doc, "italic")).toEqual(["rushed"]);
    expect(listItems(doc, "bulletList")).toEqual(["Write the notes", "Tag the build"]);
    expect(listItems(doc, "orderedList")).toEqual(["Run the tests", "Deploy"]);
    const link = nodes(doc).find((node) => node.marks?.some((m) => m.type === "link"));
    expect(link?.text).toBe("guide");
    expect(link?.marks?.[0]?.attrs?.href).toBe("https://example.com/guide");
  });
});

describe("docxToDoc", () => {
  it("keeps headings, bold, italic, underline and both list types", async () => {
    const doc = await docxToDoc(new Uint8Array(fixture("sample.docx")));
    const headings = nodes(doc).filter((node) => node.type === "heading");
    expect(headings.map((h) => [h.attrs?.level, h.content?.[0]?.text])).toEqual([
      [1, "Project plan"],
      [2, "Goals"],
    ]);
    expect(markedText(doc, "bold")).toEqual(["bold words"]);
    expect(markedText(doc, "italic")).toEqual(["italic words"]);
    expect(markedText(doc, "underline")).toEqual(["underlined words"]);
    expect(listItems(doc, "bulletList")).toEqual(["First bullet", "Second bullet"]);
    expect(listItems(doc, "orderedList")).toEqual(["First step", "Second step"]);
  });
});

describe("htmlToDoc", () => {
  it("drops scripts and images", () => {
    const doc = htmlToDoc(
      '<p>Hello</p><script>alert("x")</script><img src="x" onerror="alert(1)"><p>Bye</p>',
    );
    const json = JSON.stringify(doc);
    expect(json).not.toContain("alert");
    expect(json).not.toContain("onerror");
    expect(nodes(doc).map((node) => node.type)).toEqual([
      "doc",
      "paragraph",
      "text",
      "paragraph",
      "text",
    ]);
  });
});

// The real server check, so an import that the API would refuse fails here.
const serverAccepts = (doc: JSONContent) => contentSchema.safeParse(doc).success;

const allText = (doc: JSONContent) =>
  nodes(doc)
    .flatMap((node) => (node.type === "text" ? [node.text] : []))
    .join("|");

// The editor schema only allows text inside paragraphs and headings.
const textOutsideBlocks = (doc: JSONContent) =>
  nodes(doc).some(
    (node) =>
      ["doc", "listItem", "blockquote"].includes(node.type ?? "") &&
      node.content?.some((child) => child.type === "text" || child.type === "hardBreak"),
  );

describe("imported content the server would refuse", () => {
  it.each([
    ["a level 4 heading", "#### Deep heading", "Deep heading"],
    ["a relative link", "[rel](./other.md)", "rel"],
    ["a javascript link", "[js](javascript:alert(1))", "js"],
    ["an image", "![alt](pic.png)", "alt"],
    ["a table", "| a | b |\n|---|---|\n| 1 | 2 |", ""],
    ["a task list", "- [ ] item\n- [x] done", "item|done"],
  ])("keeps the text of %s and passes the server check", (_label, markdown, text) => {
    const doc = markdownToDoc(markdown);
    expect(serverAccepts(doc)).toBe(true);
    expect(allText(doc)).toBe(text);
    expect(markedText(doc, "link")).toEqual([]);
    expect(textOutsideBlocks(doc)).toBe(false);
  });

  it("keeps a task list as a bulleted list", () => {
    expect(listItems(markdownToDoc("- [ ] item\n- [x] done"), "bulletList")).toEqual(["item", "done"]);
  });

  it("keeps safe links", () => {
    const doc = markdownToDoc("[ok](https://example.com) and [mail](mailto:a@example.com)");
    expect(serverAccepts(doc)).toBe(true);
    expect(markedText(doc, "link")).toEqual(["ok", "mail"]);
  });

  it.each(['<a href="#bookmark">x</a>', '<a href="javascript:alert(1)">x</a>'])(
    "drops the link but keeps the text of %s",
    (html) => {
      const doc = htmlToDoc(html);
      expect(serverAccepts(doc)).toBe(true);
      expect(allText(doc)).toBe("x");
      expect(markedText(doc, "link")).toEqual([]);
    },
  );
});

describe("importFile", () => {
  it("uses the file name as the title", async () => {
    const result = await importFile(new File(["Hello"], "  Weekly notes .TXT"));
    expect(result.title).toBe("Weekly notes");
  });

  it.each([
    ["an unsupported extension", new File(["hello"], "notes.pdf")],
    ["an empty file", new File([], "notes.txt")],
    ["a file over 2 MB", new File([new Uint8Array(MAX_IMPORT_BYTES + 1).fill(97)], "big.txt")],
    ["a .docx that is not a zip", new File(["not a zip"], "report.docx")],
    ["a text file with binary data", new File([new Uint8Array([104, 0, 105])], "notes.md")],
  ])("rejects %s", async (_label, file) => {
    await expect(importFile(file)).rejects.toBeInstanceOf(ImportError);
  });
});
