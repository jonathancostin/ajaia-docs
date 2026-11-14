// Validation for document content. The content is TipTap JSON built in the
// browser (typed, or converted from an imported file), so the server treats it
// as untrusted: only the node and mark types the editor supports are stored.
// Keep these lists in step with src/lib/extensions.ts.
import { z } from "zod";

export const MAX_CONTENT_BYTES = 1024 * 1024;
const MAX_DEPTH = 40;

const NODE_TYPES = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "text",
] as const;
const MARK_TYPES = ["bold", "italic", "underline", "strike", "code", "link"] as const;
const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

const attrs = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

const mark = z
  .strictObject({ type: z.enum(MARK_TYPES), attrs: attrs.optional() })
  .refine((m) => m.type !== "link" || (typeof m.attrs?.href === "string" && SAFE_LINK.test(m.attrs.href)), {
    message: "Links must start with http://, https:// or mailto:.",
  });

interface ContentNode {
  type: (typeof NODE_TYPES)[number];
  attrs?: z.infer<typeof attrs>;
  content?: ContentNode[];
  marks?: z.infer<typeof mark>[];
  text?: string;
}

const node: z.ZodType<ContentNode> = z.lazy(() =>
  z
    .strictObject({
      type: z.enum(NODE_TYPES),
      attrs: attrs.optional(),
      content: z.array(node).optional(),
      marks: z.array(mark).optional(),
      text: z.string().min(1).optional(),
    })
    .refine((n) => (n.type === "text") === (n.text !== undefined), {
      message: "Only text nodes carry text, and they cannot be empty.",
    })
    .refine((n) => n.type !== "heading" || [1, 2, 3].includes(Number(n.attrs?.level)), {
      message: "Headings must be level 1, 2 or 3.",
    }),
);

// zod walks the tree recursively. Checking the nesting depth first, without
// recursion, keeps a hostile deeply nested body from overflowing the stack.
function withinDepth(root: unknown): boolean {
  let level: unknown[] = [root];
  for (let depth = 0; level.length > 0; depth++) {
    if (depth > MAX_DEPTH) return false;
    level = level.flatMap((item): unknown[] =>
      item && typeof item === "object" && "content" in item && Array.isArray(item.content) ? item.content : [],
    );
  }
  return true;
}

export const contentSchema = z
  .unknown()
  .refine(withinDepth, { message: "This document is nested too deeply." })
  .pipe(z.strictObject({ type: z.literal("doc"), content: z.array(node) }));

export type DocumentContent = z.infer<typeof contentSchema>;

export const EMPTY_DOCUMENT: DocumentContent = { type: "doc", content: [{ type: "paragraph" }] };
