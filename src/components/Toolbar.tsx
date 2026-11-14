import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui-sdk/react/select";
import { Toggle, ToggleIcon } from "@ui-sdk/react/toggle";
import { Toolbar as ToolbarRoot, ToolbarButton, ToolbarSeparator } from "@ui-sdk/react/toolbar";
import { Tooltip, TooltipContent, TooltipShortcut, TooltipTrigger } from "@ui-sdk/react/tooltip";
import type { LucideIcon } from "lucide-react";
import { Bold, Italic, List, ListOrdered, Quote, Redo2, Strikethrough, Underline, Undo2 } from "lucide-react";
import { useRef } from "react";
import type { ReactElement } from "react";

const blockTypes = [
  { value: "paragraph", label: "Normal text" },
  { value: "1", label: "Heading 1" },
  { value: "2", label: "Heading 2" },
  { value: "3", label: "Heading 3" },
];

function WithTooltip({
  label,
  shortcut,
  children,
}: {
  label: string;
  shortcut: string;
  children: ReactElement<Record<string, unknown>>;
}) {
  return (
    <Tooltip shortcut={shortcut}>
      <TooltipTrigger render={children} />
      <TooltipContent>
        {label} <TooltipShortcut />
      </TooltipContent>
    </Tooltip>
  );
}

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
  const blockChosen = useRef(false);

  // ui-sdk moves focus to the button that was pressed. TipTap's own focus
  // command gives it back a frame later, and in that frame a Space or Enter
  // presses the button again instead of reaching the document. Focusing the
  // view directly leaves no gap.
  const apply = (command: () => boolean) => {
    command();
    editor.view.focus();
  };

  const toggles: { label: string; shortcut: string; icon: LucideIcon; active: boolean; run: () => void }[] = [
    { label: "Bold", shortcut: "mod+b", icon: Bold, active: state.bold, run: () => apply(() => editor.chain().toggleBold().run()) },
    { label: "Italic", shortcut: "mod+i", icon: Italic, active: state.italic, run: () => apply(() => editor.chain().toggleItalic().run()) },
    { label: "Underline", shortcut: "mod+u", icon: Underline, active: state.underline, run: () => apply(() => editor.chain().toggleUnderline().run()) },
    { label: "Strikethrough", shortcut: "mod+shift+s", icon: Strikethrough, active: state.strike, run: () => apply(() => editor.chain().toggleStrike().run()) },
    { label: "Bulleted list", shortcut: "mod+shift+8", icon: List, active: state.bulletList, run: () => apply(() => editor.chain().toggleBulletList().run()) },
    { label: "Numbered list", shortcut: "mod+shift+7", icon: ListOrdered, active: state.orderedList, run: () => apply(() => editor.chain().toggleOrderedList().run()) },
    { label: "Quote", shortcut: "mod+shift+b", icon: Quote, active: state.blockquote, run: () => apply(() => editor.chain().toggleBlockquote().run()) },
  ];

  return (
    <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <ToolbarRoot
        aria-label="Formatting"
        className="mx-auto flex max-w-5xl flex-nowrap gap-1 overflow-x-auto rounded-none border-0 bg-transparent px-4 py-1.5"
        // A mouse click on a button must not take focus out of the document.
        // If it does, the next keystrokes go to the button and are lost, and the
        // pending bold or italic is dropped when focus comes back.
        onMouseDown={(event) => {
          if (!(event.target as Element).closest('[data-slot^="select-"]')) event.preventDefault();
        }}
      >
        <WithTooltip label="Undo" shortcut="mod+z">
          <ToolbarButton aria-label="Undo" disabled={!state.canUndo} onClick={() => apply(() => editor.chain().undo().run())}>
            <Undo2 aria-hidden />
          </ToolbarButton>
        </WithTooltip>
        <WithTooltip label="Redo" shortcut="mod+shift+z">
          <ToolbarButton aria-label="Redo" disabled={!state.canRedo} onClick={() => apply(() => editor.chain().redo().run())}>
            <Redo2 aria-hidden />
          </ToolbarButton>
        </WithTooltip>
        <ToolbarSeparator />
        <Select
          items={blockTypes}
          value={state.block}
          onValueChange={(value) => {
            blockChosen.current = true;
            if (value === "paragraph") editor.chain().setParagraph().run();
            else if (value) editor.chain().setHeading({ level: Number(value) as 1 | 2 | 3 }).run();
          }}
          onOpenChangeComplete={(open) => {
            // The list returns focus to its trigger as it closes; after a choice, typing belongs in the document.
            if (!open && blockChosen.current) editor.view.focus();
            blockChosen.current = false;
          }}
        >
          <ToolbarButton render={<SelectTrigger />} aria-label="Text style" className="min-w-36 justify-between">
            <SelectValue />
          </ToolbarButton>
          <SelectContent>
            {blockTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToolbarSeparator />
        {toggles.map(({ label, shortcut, icon: Icon, active, run }) => (
          <WithTooltip key={label} label={label} shortcut={shortcut}>
            <Toggle aria-label={label} pressed={active} onPressedChange={run}>
              <ToggleIcon>
                <Icon />
              </ToggleIcon>
            </Toggle>
          </WithTooltip>
        ))}
      </ToolbarRoot>
    </div>
  );
}
