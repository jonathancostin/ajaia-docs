// One list of editor extensions, used by the editor, the file importers and
// the Markdown export, so all three agree on what a document can contain.
// The server allows the same node and mark types (worker/content.ts).
import StarterKit from "@tiptap/starter-kit";

export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] },
  }),
];
