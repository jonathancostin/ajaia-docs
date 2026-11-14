import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import type { LucideIcon } from "lucide-react";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import { focusRing } from "../styles";

const blockTypes = [
  { value: "paragraph", label: "Normal text" },
  { value: "1", label: "Heading 1" },
  { value: "2", label: "Heading 2" },
  { value: "3", label: "Heading 3" },
] as const;

export function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
      block: ([1, 2, 3] as const).find((level) => editor.isActive("heading", { level }))?.toString() ?? "paragraph",
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      strike: editor.isActive("strike"),
      bulletList: editor.isActive("bulletList"),
      orderedList: editor.isActive("orderedList"),
      blockquote: editor.isActive("blockquote"),
    }),
  });

  const toggles: { label: string; shortcut: string; icon: LucideIcon; active: boolean; run: () => void }[] = [
    { label: "Bold", shortcut: "Ctrl+B", icon: Bold, active: state.bold, run: () => editor.chain().focus().toggleBold().run() },
    { label: "Italic", shortcut: "Ctrl+I", icon: Italic, active: state.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { label: "Underline", shortcut: "Ctrl+U", icon: Underline, active: state.underline, run: () => editor.chain().focus().toggleUnderline().run() },
    { label: "Strikethrough", shortcut: "Ctrl+Shift+S", icon: Strikethrough, active: state.strike, run: () => editor.chain().focus().toggleStrike().run() },
    { label: "Bulleted list", shortcut: "Ctrl+Shift+8", icon: List, active: state.bulletList, run: () => editor.chain().focus().toggleBulletList().run() },
    { label: "Numbered list", shortcut: "Ctrl+Shift+7", icon: ListOrdered, active: state.orderedList, run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: "Quote", shortcut: "Ctrl+Shift+B", icon: Quote, active: state.blockquote, run: () => editor.chain().focus().toggleBlockquote().run() },
  ];

  const buttonClass = `inline-flex size-9 shrink-0 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent aria-pressed:bg-blue-50 aria-pressed:text-blue-700 ${focusRing}`;

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur"
      // A mouse click on a button must not take focus out of the document.
      // If it does, the next keystrokes go to the button and are lost, and the
      // pending bold or italic is dropped when focus comes back.
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLSelectElement)) event.preventDefault();
      }}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 py-1.5">
        <button
          type="button"
          className={buttonClass}
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={!state.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className={buttonClass}
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          disabled={!state.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="size-4" aria-hidden />
        </button>
        <span className="mx-1 h-6 w-px shrink-0 bg-slate-200" aria-hidden />
        <select
          aria-label="Text style"
          title="Text style"
          className={`h-9 shrink-0 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800 ${focusRing}`}
          value={state.block}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "paragraph") editor.chain().focus().setParagraph().run();
            else editor.chain().focus().setHeading({ level: Number(value) as 1 | 2 | 3 }).run();
          }}
        >
          {blockTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <span className="mx-1 h-6 w-px shrink-0 bg-slate-200" aria-hidden />
        {toggles.map(({ label, shortcut, icon: Icon, active, run }) => (
          <button
            key={label}
            type="button"
            className={buttonClass}
            aria-label={label}
            title={`${label} (${shortcut})`}
            aria-pressed={active}
            onClick={run}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}
