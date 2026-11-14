// One list of editor extensions, used by the editor, the file importers and
// the Markdown export, so all three agree on what a document can contain.
// The server allows the same node and mark types (worker/content.ts).
import StarterKit from "@tiptap/starter-kit";

export const HEADING_LEVELS = [1, 2, 3] as const;

/** The server refuses any other link, so the editor must never produce one. */
export const isSafeLink = (href: string) => /^(https?:\/\/|mailto:)/i.test(href);

export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [...HEADING_LEVELS] },
    link: { openOnClick: false, autolink: true, isAllowedUri: isSafeLink },
  }),
];
