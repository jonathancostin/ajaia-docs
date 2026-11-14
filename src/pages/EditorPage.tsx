import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorContent, useEditor } from "@tiptap/react";
import { Button } from "@ui-sdk/react/button";
import { Field, FieldLabel } from "@ui-sdk/react/field";
import { Input } from "@ui-sdk/react/input";
import { Download } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { api, ApiError } from "../api";
import type { DocumentDetail } from "../api";
import { Header } from "../components/Header";
import { ShareDialog } from "../components/ShareDialog";
import { Toolbar } from "../components/Toolbar";
import { useAutosave } from "../hooks/useAutosave";
import type { SaveStatus } from "../hooks/useAutosave";
import { editorExtensions } from "../lib/extensions";
import { handleApiError, useUser } from "../session";

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
    // The editor owns the content once loaded; never reuse a stale copy.
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

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
  return <DocumentEditor initial={query.data.document} />;
}

const statusText: Record<Exclude<SaveStatus, "error">, string> = {
  saved: "Saved",
  saving: "Saving...",
  unsaved: "Unsaved changes",
  conflict: "Unsaved changes",
};

function DocumentEditor({ initial }: { initial: DocumentDetail }) {
  const queryClient = useQueryClient();
  const canEdit = initial.role !== "viewer";
  const isOwner = initial.role === "owner";
  const [title, setTitle] = useState(initial.title);
  const [actionError, setActionError] = useState<string | null>(null);
  const titleRef = useRef(initial.title);
  // Kept from the last update so a save on unmount does not need the editor.
  const contentRef = useRef<ProseMirrorNode | null>(null);

  const getDraft = useCallback(
    () => ({
      title: titleRef.current.trim() || "Untitled document",
      content: contentRef.current?.toJSON() ?? initial.content,
    }),
    [initial.content],
  );
  const onSaved = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["documents"] });
  }, [queryClient]);
  const autosave = useAutosave({ id: initial.id, version: initial.version, getDraft, onSaved });
  const { markDirty } = autosave;

  const editor = useEditor({
    extensions: editorExtensions,
    content: initial.content,
    editable: canEdit,
    editorProps: {
      attributes: {
        class: "prose prose-slate max-w-none",
        "aria-label": "Document content",
      },
    },
    onUpdate: ({ editor }) => {
      contentRef.current = editor.state.doc;
      markDirty();
    },
  });

  async function loadTheirVersion() {
    setActionError(null);
    try {
      const { document: latest } = await api.getDocument(initial.id);
      editor.commands.setContent(latest.content, { emitUpdate: false });
      contentRef.current = editor.state.doc;
      titleRef.current = latest.title;
      setTitle(latest.title);
      autosave.acceptVersion(latest.version);
    } catch (error) {
      handleApiError(error);
      setActionError(error instanceof Error ? error.message : "Could not load the latest version.");
    }
  }

  async function downloadMarkdown() {
    setActionError(null);
    try {
      // Loaded on demand: the Markdown serializer is only needed for downloads.
      const { toMarkdown } = await import("../lib/export");
      const blob = new Blob([toMarkdown(editor.getJSON())], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(titleRef.current.trim() || "Untitled document").replace(/[\\/:*?"<>|]/g, "-")}.md`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setActionError("Could not create the Markdown file.");
    }
  }

  const { status, conflict } = autosave;

  return (
    <>
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1 basis-60">
            <Field>
              <FieldLabel className="sr-only">Document title</FieldLabel>
              <Input
                className="-mx-1 h-auto w-full border-transparent bg-transparent px-1 text-xl font-semibold text-slate-900 placeholder:text-slate-500 hover:bg-slate-50 read-only:hover:bg-transparent"
                placeholder="Untitled document"
                value={title}
                readOnly={!canEdit}
                onValueChange={(value) => {
                  titleRef.current = value;
                  setTitle(value);
                  markDirty();
                }}
              />
            </Field>
            <div className="flex flex-wrap gap-x-3 text-sm text-slate-500">
              {!isOwner && <span>Owned by {initial.owner.name}</span>}
              {canEdit && (
                <span aria-live="polite">
                  {status === "error" ? (
                    <span className="text-red-700">
                      Could not save.{" "}
                      <Button
                        className="h-auto border-0 bg-transparent p-0 align-baseline font-medium text-red-700 underline"
                        onClick={() => autosave.retry()}
                      >
                        Retry
                      </Button>
                    </span>
                  ) : (
                    statusText[status]
                  )}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <ShareDialog documentId={initial.id} isOwner={isOwner} />
            <Button onClick={downloadMarkdown}>
              <Download aria-hidden />
              Download as Markdown
            </Button>
          </div>
        </div>
      </div>

      {canEdit && <Toolbar editor={editor} />}

      <main className="flex-1 px-2 py-6 sm:px-6 sm:py-10">
        <div className="mx-auto max-w-[816px] space-y-3">
          {!canEdit && (
            <p className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700">
              You can view this document but not edit it.
            </p>
          )}
          {conflict && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              <p className="mr-auto">
                {conflict.current?.updatedBy?.name ?? "Someone else"} saved a newer version of this document.
              </p>
              <Button onClick={loadTheirVersion}>Load their version</Button>
              <Button data-variant="solid" onClick={autosave.keepMine}>
                Keep mine
              </Button>
            </div>
          )}
          {actionError && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              {actionError}
            </p>
          )}
          <div className="rounded-sm border border-slate-200 bg-white px-5 py-8 shadow-sm sm:px-16 sm:py-14">
            <EditorContent editor={editor} />
          </div>
        </div>
      </main>
    </>
  );
}
