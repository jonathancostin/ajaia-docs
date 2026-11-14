import type { JSONContent } from "@tiptap/core";
import { getMarkdownManager } from "./import";

export function toMarkdown(content: JSONContent): string {
  return getMarkdownManager().serialize(content);
}
