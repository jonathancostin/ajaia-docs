import { generateJSON } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { editorExtensions } from "./extensions";

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

function ensureParagraph(doc: JSONContent): JSONContent {
  if (doc.content && doc.content.length > 0) return { ...doc, type: "doc" };
  return { type: "doc", content: [{ type: "paragraph" }] };
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

  return ensureParagraph({ type: "doc", content });
}

let markdownManager: MarkdownManager | undefined;

export function getMarkdownManager(): MarkdownManager {
  markdownManager ??= new MarkdownManager({ extensions: editorExtensions });
  return markdownManager;
}

export function markdownToDoc(markdown: string): JSONContent {
  return ensureParagraph(getMarkdownManager().parse(markdown.replace(/\r\n?/g, "\n")));
}

// Tags the schema does not know (script, img, tables) are dropped here.
export function htmlToDoc(html: string): JSONContent {
  return ensureParagraph(generateJSON(html, editorExtensions));
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
