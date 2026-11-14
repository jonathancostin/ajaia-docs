import { useQuery, useQueryClient } from "@tanstack/react-query";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Button } from "@ui-sdk/react/button";
import { Field, FieldLabel } from "@ui-sdk/react/field";
import { Input } from "@ui-sdk/react/input";
import { ArrowLeft, Download } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { api, ApiError } from "../api";
import type { DocumentDetail } from "../api";
import { Header } from "../components/Header";
import { HistoryDialog } from "../components/HistoryDialog";
import { Presence, userColor } from "../components/Presence";
import { ShareDialog } from "../components/ShareDialog";
import { Toolbar } from "../components/Toolbar";
import { useCollab, useCollabTitle } from "../hooks/useCollab";
import type { CollabRoom } from "../hooks/useCollab";
import { COLLAB_FIELD, starterKitOptions } from "../lib/extensions";
import { contentWidth } from "../layout";
import { useUser } from "../session";

export function EditorPage() {
  const { id = "" } = useParams();
  const user = useUser();
  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      <Header />
      {/* Keyed by user so switching user reloads the document with the new user's access. */}
      <DocumentLoader key={`${user.id}:${id}`} id={id} />
    </div>
  );
}

function DocumentLoader({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["document", id],
    queryFn: () => api.getDocument(id),
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  // Bumped when the server closes the room, so the room reopens with the access the server now reports.
  const [generation, setGeneration] = useState(0);

  if (query.isPending) return <p className="p-8 text-center text-slate-600">Loading document...</p>;
  if (query.isError) {
    const missing =
      query.error instanceof ApiError && (query.error.code === "not_found" || query.error.code === "forbidden");
    return (
      <div role="alert" className="mx-auto mt-16 max-w-md px-4 text-center">
        <p className="text-slate-800">
          {missing ? "This document does not exist or you do not have access to it." : query.error.message}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          {!missing && <Button onClick={() => query.refetch()}>Try again</Button>}
          <Button data-variant="solid" render={<Link to="/" />}>
            Go to your documents
          </Button>
        </div>
      </div>
    );
  }
  const document = query.data.document;
  return (
    <DocumentRoom
      key={`${document.role}:${generation}`}
      document={document}
      onAccessChanged={async () => {
        await query.refetch();
        setGeneration((value) => value + 1);
      }}
      onUnreachable={() => void query.refetch()}
    />
  );
}

function DocumentRoom({
  document,
  onAccessChanged,
  onUnreachable,
}: {
  document: DocumentDetail;
  onAccessChanged: () => void;
  onUnreachable: () => void;
}) {
  const queryClient = useQueryClient();
  const [lastEditor, setLastEditor] = useState(document.updatedBy);
  const collab = useCollab(document.id, {
    onSaved: (message) => {
      setLastEditor(message.updatedBy);
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onAccessChanged,
    onUnreachable,
  });

  if (!collab.room || !collab.synced) return <p className="p-8 text-center text-slate-600">Loading document...</p>;
  return (
    <DocumentEditor
      document={document}
      room={collab.room}
      connected={collab.connected}
      pending={collab.pending}
      saveError={collab.saveError}
      lastEditor={lastEditor}
    />
  );
}

function DocumentEditor({
  document: meta,
  room,
  connected,
  pending,
  saveError,
  lastEditor,
}: {
  document: DocumentDetail;
  room: CollabRoom;
  connected: boolean;
  pending: boolean;
  saveError: string | null;
  lastEditor: DocumentDetail["updatedBy"];
}) {
  const user = useUser();
  const canEdit = meta.role !== "viewer";
  const isOwner = meta.role === "owner";
  const title = useCollabTitle(room.ydoc);
  const [actionError, setActionError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ ...starterKitOptions, undoRedo: false }),
      Collaboration.configure({ document: room.ydoc, field: COLLAB_FIELD }),
      CollaborationCaret.configure({
        provider: room.provider,
        user: { id: user.id, name: user.name, color: userColor(user.id) },
        // Colours come from other clients, so only a plain hex colour reaches the style attribute.
        selectionRender: (other) =>
          typeof other.color === "string" && /^#[0-9a-f]{6}$/i.test(other.color)
            ? { class: "collab-selection", style: `background-color: ${other.color}33` }
            : {},
      }),
    ],
    editable: canEdit,
    editorProps: {
      attributes: {
        class: "prose prose-slate max-w-none",
        "aria-label": "Document content",
      },
    },
  });

  async function downloadMarkdown() {
    setActionError(null);
    try {
      // Loaded on demand: the Markdown serializer is only needed for downloads.
      const { toMarkdown } = await import("../lib/export");
      const blob = new Blob([toMarkdown(editor.getJSON())], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `${(title.title.trim() || "Untitled document").replace(/[\\/:*?"<>|]/g, "-")}.md`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setActionError("Could not create the Markdown file.");
    }
  }

  return (
    <>
      <div className="border-b border-slate-200 bg-white">
        <div className={`${contentWidth} flex items-center justify-between gap-3 pt-2.5`}>
          <Link
            to="/"
            className="inline-flex items-center gap-1 rounded text-sm font-medium text-slate-700 no-underline hover:text-blue-700"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to documents
          </Link>
          <Presence provider={room.provider} selfId={user.id} />
        </div>
        <div className={`${contentWidth} flex flex-wrap items-center gap-x-4 gap-y-2 pt-1.5 pb-3`}>
          <div className="min-w-0 flex-1 basis-60">
            <Field>
              <FieldLabel className="sr-only">Document title</FieldLabel>
              <Input
                className="-mx-1 h-auto w-full border-transparent bg-transparent px-1 text-xl font-semibold text-slate-900 placeholder:text-slate-500 hover:bg-slate-50 read-only:hover:bg-transparent"
                placeholder="Untitled document"
                value={title.title}
                readOnly={!canEdit}
                maxLength={200}
                onValueChange={title.change}
                onBlur={() => canEdit && title.commit()}
              />
            </Field>
            <div className="flex flex-wrap gap-x-3 text-sm text-slate-500">
              {!isOwner && <span>Owned by {meta.owner.name}</span>}
              {lastEditor && lastEditor.id !== user.id && <span>Last edited by {lastEditor.name}</span>}
              <span aria-live="polite">
                {!connected ? (
                  <span className="text-amber-800">Offline. Changes will sync when you reconnect.</span>
                ) : !canEdit ? null : saveError ? (
                  <span className="text-red-700">{saveError}</span>
                ) : pending ? (
                  "Saving..."
                ) : (
                  "Saved"
                )}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ShareDialog documentId={meta.id} isOwner={isOwner} />
            <HistoryDialog documentId={meta.id} currentTitle={title.title} canRestore={canEdit} />
            <Button onClick={downloadMarkdown}>
              <Download aria-hidden />
              Download as Markdown
            </Button>
          </div>
        </div>
      </div>

      {canEdit && <Toolbar editor={editor} />}

      <main className="flex-1 py-6 sm:py-8">
        <div className={`${contentWidth} space-y-3`}>
          {!canEdit && (
            <p className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700">
              You can view this document but not edit it.
            </p>
          )}
          {actionError && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              {actionError}
            </p>
          )}
          <div
            className="min-h-[calc(100dvh-19rem)] rounded-sm border border-slate-200 bg-white px-5 py-8 shadow-sm sm:px-16 sm:py-14"
            onMouseDown={(event) => {
              if (!canEdit || event.target !== event.currentTarget) return;
              event.preventDefault();
              // Not editor.commands.focus("end"): that waits a frame, and keys typed in that frame are lost.
              editor.commands.setTextSelection(editor.state.doc.content.size);
              editor.view.focus();
            }}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      </main>
    </>
  );
}
