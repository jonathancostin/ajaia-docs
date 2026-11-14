import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { Button } from "@ui-sdk/react/button";
import {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@ui-sdk/react/drawer";
import { Listbox, ListboxItem } from "@ui-sdk/react/listbox";
import { History, X } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { editorExtensions } from "../lib/extensions";
import { formatDateTime } from "../lib/format";
import { handleApiError } from "../session";

export function HistoryDialog({
  documentId,
  currentTitle,
  canRestore,
}: {
  documentId: string;
  currentTitle: string;
  canRestore: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Drawer side="right" open={open} onOpenChange={setOpen}>
      <DrawerTrigger>
        <History aria-hidden />
        History
      </DrawerTrigger>
      <DrawerBackdrop />
      <DrawerContent className="h-full max-h-none w-[min(56rem,100vw)] max-w-full gap-0 overflow-hidden p-0">
        <HistoryPanel
          documentId={documentId}
          currentTitle={currentTitle}
          canRestore={canRestore}
          restore={async (versionId) => {
            // The server sends the restored content to every open editor through the room.
            await api.restoreVersion(documentId, versionId);
            setOpen(false);
          }}
        />
      </DrawerContent>
    </Drawer>
  );
}

function HistoryPanel({
  documentId,
  currentTitle,
  canRestore,
  restore,
}: {
  documentId: string;
  currentTitle: string;
  canRestore: boolean;
  restore: (versionId: string) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const versions = useQuery({ queryKey: ["versions", documentId], queryFn: () => api.listVersions(documentId) });
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = versions.data?.versions ?? [];
  const selected = chosen ?? list[0]?.id ?? null;

  async function onRestore() {
    if (!selected) return;
    setError(null);
    try {
      await restore(selected);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["documents"] }),
        queryClient.invalidateQueries({ queryKey: ["versions", documentId] }),
      ]);
    } catch (caught) {
      handleApiError(caught);
      setError(caught instanceof Error ? caught.message : "Could not restore this version.");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <DrawerTitle>Version history</DrawerTitle>
        <DrawerClose aria-label="Close" className="border-transparent">
          <X aria-hidden />
        </DrawerClose>
      </div>

      {versions.isPending ? (
        <p className="p-5 text-sm text-slate-600">Loading versions...</p>
      ) : versions.isError ? (
        <div role="alert" className="p-5 text-sm text-slate-700">
          <p>{versions.error.message}</p>
          <Button className="mt-2" onClick={() => versions.refetch()}>
            Try again
          </Button>
        </div>
      ) : list.length === 0 ? (
        <p className="p-5 text-sm text-slate-600">
          No earlier versions yet. A version is kept when someone else edits the document, every ten minutes while you
          work, and before every restore.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <Listbox
            aria-label="Versions"
            value={selected}
            onValueChange={(value) => value && setChosen(value)}
            className="max-h-48 w-full shrink-0 overflow-y-auto rounded-none border-0 border-b border-slate-200 md:max-h-none md:w-72 md:border-r md:border-b-0"
          >
            {list.map((version) => (
              <ListboxItem
                key={version.id}
                value={version.id}
                label={formatDateTime(version.savedAt)}
                className="h-auto flex-col items-start gap-0 py-2 data-selected:bg-blue-50 data-selected:ring-1 data-selected:ring-blue-600"
              >
                <span className="text-sm font-medium text-slate-900">{formatDateTime(version.savedAt)}</span>
                <span className="text-xs text-slate-600">
                  by {version.savedBy?.name ?? "someone who left"}
                </span>
                {version.title !== currentTitle && (
                  <span className="max-w-full truncate text-xs text-slate-600">{version.title}</span>
                )}
              </ListboxItem>
            ))}
          </Listbox>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
            {selected && <VersionPreview key={selected} documentId={documentId} versionId={selected} />}
            {error && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            {canRestore ? (
              <Button data-variant="solid" className="self-end" disabled={!selected} onClick={onRestore}>
                Restore this version
              </Button>
            ) : (
              <p className="text-sm text-slate-600">You can view earlier versions but not restore them.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function VersionPreview({ documentId, versionId }: { documentId: string; versionId: string }) {
  const version = useQuery({
    queryKey: ["version", documentId, versionId],
    queryFn: () => api.getVersion(documentId, versionId),
    staleTime: Infinity,
  });

  return (
    <div
      aria-label="Version preview"
      role="region"
      className="min-h-0 flex-1 overflow-y-auto rounded-md border border-slate-200 bg-white px-5 py-4"
    >
      {version.isPending ? (
        <p className="text-sm text-slate-600">Loading version...</p>
      ) : version.isError ? (
        <div role="alert" className="text-sm text-slate-700">
          <p>{version.error.message}</p>
          <Button className="mt-2" onClick={() => version.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <ReadOnlyDocument content={version.data.version.content} />
      )}
    </div>
  );
}

function ReadOnlyDocument({ content }: { content: JSONContent }) {
  const editor = useEditor({
    extensions: editorExtensions,
    content,
    editable: false,
    editorProps: { attributes: { class: "prose prose-slate max-w-none" } },
  });
  return <EditorContent editor={editor} />;
}
