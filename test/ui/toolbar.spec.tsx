import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { createAgent } from "@ui-sdk/react/agent";
import { expect, test } from "vitest";
import { Toolbar } from "../../src/components/Toolbar";
import { editorExtensions } from "../../src/lib/extensions";

const agent = createAgent();

function renderToolbar() {
  const view: { editor?: Editor } = {};
  function Harness() {
    const editor = useEditor({ extensions: editorExtensions, content: "<p>Hello world</p>" });
    view.editor = editor;
    return (
      <>
        <Toolbar editor={editor} />
        <EditorContent editor={editor} />
      </>
    );
  }
  render(<Harness />);
  return view.editor!;
}

const names = [
  "Undo",
  "Redo",
  "Text style",
  "Bold",
  "Italic",
  "Underline",
  "Strikethrough",
  "Bulleted list",
  "Numbered list",
  "Quote",
];

test("an agent can find every formatting control and format the selection", async () => {
  const editor = renderToolbar();
  editor.commands.setTextSelection({ from: 1, to: 12 });

  const components = agent.snapshot().filter((entry) => !entry.offPage && entry.component !== "more");
  for (const entry of components) {
    expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy();
  }
  const labels = components.map((entry) => entry.label);
  for (const name of ["Formatting", ...names]) {
    expect(labels, `${name} is missing from the snapshot`).toContain(name);
  }
  const result = await agent.act({
    steps: [
      { ref: "Bold", action: "setPressed", args: [true] },
      { ref: "Italic", action: "setPressed", args: [true] },
      { ref: "Text style", action: "setValue", args: ["Heading 2"] },
    ],
  });
  expect(result.ok, result.error?.message).toBe(true);
  expect(editor.getHTML()).toContain("<h2><strong><em>Hello world</em></strong></h2>");
  expect(screen.getByRole("button", { name: "Bold" }).getAttribute("aria-pressed")).toBe("true");
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Text style" }).textContent).toBe("Heading 2"),
  );
});

test("every control is named in the markup and pressed state follows the editor", () => {
  const editor = renderToolbar();
  const toolbar = screen.getByRole("toolbar", { name: "Formatting" });
  expect(toolbar).toBeTruthy();
  for (const name of names.filter((name) => name !== "Text style")) {
    const button = screen.getByRole("button", { name });
    expect(button.getAttribute("aria-keyshortcuts"), `${name} shortcut`).toBeTruthy();
  }
  expect(screen.getByRole("button", { name: "Bold" }).getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByRole("button", { name: "Bold" }).hasAttribute("aria-disabled")).toBe(false);
  expect(screen.getByRole("button", { name: "Undo" }).getAttribute("aria-disabled")).toBe("true");

  act(() => {
    editor.chain().selectAll().toggleUnderline().run();
  });
  expect(screen.getByRole("button", { name: "Underline" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Undo" }).hasAttribute("aria-disabled")).toBe(false);
});

test("a click on a button keeps focus in the document, and the text style list still opens", () => {
  const editor = renderToolbar();
  editor.commands.setTextSelection({ from: 1, to: 12 });

  const bold = screen.getByRole("button", { name: "Bold" });
  expect(fireEvent.mouseDown(bold)).toBe(false);
  fireEvent.click(bold);
  expect(editor.getHTML()).toContain("<strong>Hello world</strong>");
  expect(bold.getAttribute("aria-pressed")).toBe("true");

  const textStyle = screen.getByRole("combobox", { name: "Text style" });
  expect(fireEvent.mouseDown(textStyle)).toBe(true);
  fireEvent.click(textStyle);
  fireEvent.click(screen.getByRole("option", { name: "Heading 1" }));
  expect(editor.getHTML()).toContain("<h1><strong>Hello world</strong></h1>");
});
