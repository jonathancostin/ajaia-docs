import { generateJSON } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { HEADING_LEVELS, editorExtensions, isSafeLink } from "./extensions";

export const SUPPORTED_EXTENSIONS = [".txt", ".md", ".docx"] as const;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

const MAX_TITLE_LENGTH = 200;
const DAMAGED_DOCX = "That .docx file could not be read. It may be damaged.";

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

// The server rejects a whole document that strays from these lists
// (worker/content.ts), and the parsers do produce such content: Markdown keeps
// relative and javascript: links, images and task items leave bare text where
// a block belongs. Keep these lists in step with the server.
const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
]);
const INLINE_TYPES = new Set(["text", "hardBreak"]);
const MARK_TYPES = new Set(["bold", "italic", "underline", "strike", "code", "link"]);
// Nodes whose children must be blocks, so stray inline content gets a paragraph.
const BLOCK_CONTAINERS = new Set(["doc", "blockquote", "listItem"]);
const NEEDS_CONTENT = new Set(["bulletList", "orderedList", "listItem", "blockquote"]);
const MAX_HEADING_LEVEL = HEADING_LEVELS[HEADING_LEVELS.length - 1];

function cleanAttrs(attrs: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const entries = Object.entries(attrs ?? {}).filter(
    ([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value),
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function wrapInline(children: JSONContent[]): JSONContent[] {
  const blocks: JSONContent[] = [];
  let open: JSONContent | undefined;
  for (const child of children) {
    if (!INLINE_TYPES.has(child.type ?? "")) {
      blocks.push(child);
      open = undefined;
      continue;
    }
    const last = blocks.at(-1);
    // A task item parses as an empty paragraph followed by its bare text.
    if (!open && last?.type === "paragraph" && !last.content) open = last;
    if (!open) {
      open = { type: "paragraph" };
      blocks.push(open);
    }
    open.content = [...(open.content ?? []), child];
  }
  return blocks;
}

function normalizeNode(node: JSONContent): JSONContent[] {
  const type = node.type ?? "";
  if (type === "text") {
    if (!node.text) return [];
    const marks = (node.marks ?? [])
      .filter(
        (mark) =>
          MARK_TYPES.has(mark.type) &&
          (mark.type !== "link" || (typeof mark.attrs?.href === "string" && isSafeLink(mark.attrs.href))),
      )
      .map((mark) => {
        const attrs = cleanAttrs(mark.attrs);
        return attrs ? { type: mark.type, attrs } : { type: mark.type };
      });
    return [marks.length > 0 ? { type, text: node.text, marks } : { type, text: node.text }];
  }

  let content = (node.content ?? []).flatMap(normalizeNode);
  // An unknown node gives way to whatever supported content it holds.
  if (!BLOCK_TYPES.has(type) && !INLINE_TYPES.has(type) && type !== "doc") return content;
  if (BLOCK_CONTAINERS.has(type)) content = wrapInline(content);
  if (NEEDS_CONTENT.has(type) && content.length === 0) return [];

  const result: JSONContent = { type };
  const attrs = cleanAttrs(node.attrs);
  if (type === "heading") {
    const level = Math.round(Number(attrs?.level)) || 1;
    result.attrs = { ...attrs, level: Math.min(Math.max(level, 1), MAX_HEADING_LEVEL) };
  } else if (attrs && type !== "doc") {
    result.attrs = attrs;
  }
  if (content.length > 0) result.content = content;
  return [result];
}

/** Makes parser output something the server accepts, with at least one paragraph. */
function normalizeDoc(doc: JSONContent): JSONContent {
  const content = normalizeNode({ ...doc, type: "doc" })[0]?.content ?? [];
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}

export function textToDoc(text: string): JSONContent {
  const blocks = text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((block) => block.replace(/^\n+|\n+$/g, ""))
    .filter((block) => block.trim() !== "");

  const content = blocks.map((block): JSONContent => {
    const inline: JSONContent[] = [];
    block.split("\n").forEach((line, index) => {
      if (index > 0) inline.push({ type: "hardBreak" });
      if (line !== "") inline.push({ type: "text", text: line });
    });
    return { type: "paragraph", content: inline };
  });

  return normalizeDoc({ type: "doc", content });
}

let markdownManager: MarkdownManager | undefined;

export function getMarkdownManager(): MarkdownManager {
  markdownManager ??= new MarkdownManager({ extensions: editorExtensions });
  return markdownManager;
}

export function markdownToDoc(markdown: string): JSONContent {
  return normalizeDoc(getMarkdownManager().parse(markdown.replace(/\r\n?/g, "\n")));
}

// Tags the schema does not know (script, img, tables) are dropped by generateJSON.
export function htmlToDoc(html: string): JSONContent {
  return normalizeDoc(generateJSON(html, editorExtensions));
}

export async function docxToDoc(bytes: Uint8Array): Promise<JSONContent> {
  // Loaded on demand so mammoth stays in its own chunk, out of the main bundle.
  const { default: mammoth } = await import("mammoth");
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  // The browser build of mammoth reads `arrayBuffer`, the Node build reads `buffer`.
  const input = { arrayBuffer, buffer: bytes } as unknown as { arrayBuffer: ArrayBuffer };
  let html: string;
  try {
    html = (await mammoth.convertToHtml(input, { styleMap: ["u => u"] })).value;
  } catch {
    throw new ImportError(DAMAGED_DOCX);
  }
  return htmlToDoc(html);
}

function titleFromName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).trim().slice(0, MAX_TITLE_LENGTH).trim();
  return base || "Untitled document";
}

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

export async function importFile(file: File): Promise<{ title: string; content: JSONContent }> {
  const name = file.name.toLowerCase();
  const extension = SUPPORTED_EXTENSIONS.find((ext) => name.endsWith(ext));
  if (!extension) {
    throw new ImportError("That file type is not supported. Use .txt, .md or .docx.");
  }
  if (file.size === 0) throw new ImportError("That file is empty.");
  if (file.size > MAX_IMPORT_BYTES) throw new ImportError("That file is larger than 2 MB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const title = titleFromName(file.name);

  if (extension === ".docx") {
    if (!ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
      throw new ImportError(DAMAGED_DOCX);
    }
    return { title, content: await docxToDoc(bytes) };
  }

  if (bytes.includes(0)) {
    throw new ImportError(`That ${extension} file contains binary data. Check that it is a text file.`);
  }
  const text = new TextDecoder().decode(bytes);
  return { title, content: extension === ".md" ? markdownToDoc(text) : textToDoc(text) };
}
