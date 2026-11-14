// One list of editor extensions, used by the editor, the file importers, the
// Markdown export and the real-time room on the server, so all four agree on
// what a document can contain. The server allows the same node and mark types
// (worker/content.ts).
import StarterKit, { type StarterKitOptions } from "@tiptap/starter-kit";

export const HEADING_LEVELS = [1, 2, 3] as const;

/** The server refuses any other link, so the editor must never produce one. */
export const isSafeLink = (href: string) => /^(https?:\/\/|mailto:)/i.test(href);

export const starterKitOptions: Partial<StarterKitOptions> = {
  heading: { levels: [...HEADING_LEVELS] },
  link: { openOnClick: false, autolink: true, isAllowedUri: isSafeLink },
};

export const editorExtensions = [StarterKit.configure(starterKitOptions)];

/** Where a document lives inside its shared Yjs document. */
export const COLLAB_FIELD = "default";
export const COLLAB_META = "meta";
