import { describe, expect, it } from "vitest";
import { toMarkdown } from "../../src/lib/export";
import { markdownToDoc } from "../../src/lib/import";

const text = (value: string, marks?: string[]) => ({
  type: "text",
  text: value,
  ...(marks ? { marks: marks.map((type) => ({ type })) } : {}),
});

const sample = "# Plan\n\nShip the **editor** first, then <u>sharing</u>.\n\n- Write\n- Test";

describe("toMarkdown", () => {
  it("serializes headings, marks and bulleted lists", () => {
    const markdown = toMarkdown({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [text("Plan")] },
        {
          type: "paragraph",
          content: [
            text("Ship the "),
            text("editor", ["bold"]),
            text(" first, then "),
            text("sharing", ["underline"]),
            text("."),
          ],
        },
        {
          type: "bulletList",
          content: ["Write", "Test"].map((item) => ({
            type: "listItem",
            content: [{ type: "paragraph", content: [text(item)] }],
          })),
        },
      ],
    });
    expect(markdown).toBe(sample);
  });

  it("round-trips Markdown through the editor format", () => {
    expect(toMarkdown(markdownToDoc(sample))).toBe(sample);
  });
});
