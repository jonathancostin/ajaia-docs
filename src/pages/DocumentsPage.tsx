import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../api";
import type { DocumentSummary } from "../api";
import { Header } from "../components/Header";
import { formatRelativeTime, roleLabels } from "../lib/format";
import { dangerButton, focusRing, primaryButton, secondaryButton } from "../styles";

async function importDocument(file: File) {
  // Loaded on first use so mammoth stays out of the main bundle.
  const importer = await import("../lib/import").catch(() => {
    throw new Error("Could not load the importer. Reload the page and try again.");
  });
  const imported = await importer.importFile(file).catch((error: unknown) => {
    throw error instanceof importer.ImportError ? error : new Error("Could not read this file.");
  });
  return (await api.createDocument(imported)).document;
}

export function DocumentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const documents = useQuery({ queryKey: ["documents"], queryFn: api.listDocuments });

  const create = useMutation({
    mutationFn: () => api.createDocument({}),
    onSuccess: ({ document }) => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      void navigate(`/d/${document.id}`);
    },
  });
  const importer = useMutation({
    mutationFn: importDocument,
    onSuccess: (document) => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      void navigate(`/d/${document.id}`);
    },
  });
  const actionError = create.error ?? importer.error;

  return (
    <div className="min-h-dvh bg-slate-50">
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="mr-auto text-2xl font-semibold text-slate-900">Documents</h1>
          <button
            type="button"
            className={primaryButton}
            disabled={create.isPending}
            onClick={() => {
              importer.reset();
              create.mutate();
            }}
          >
            <Plus className="size-4" aria-hidden />
            {create.isPending ? "Creating..." : "New document"}
          </button>
          <button
            type="button"
            className={secondaryButton}
            disabled={importer.isPending}
            aria-describedby="import-help"
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="size-4" aria-hidden />
            {importer.isPending ? "Importing..." : "Import file"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".txt,.md,.docx"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              create.reset();
              importer.mutate(file);
            }}
          />
        </div>
        <p id="import-help" className="mt-2 text-right text-sm text-slate-500">
          Supported: .txt, .md, .docx, up to 2 MB
        </p>
        {actionError && (
          <p role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {actionError.message}
          </p>
        )}

        {documents.isPending ? (
          <p className="mt-10 text-slate-600">Loading documents...</p>
        ) : documents.isError ? (
          <div role="alert" className="mt-10 rounded-lg border border-slate-200 bg-white p-6 text-center">
            <p className="text-slate-700">{documents.error.message}</p>
            <button type="button" className={`${secondaryButton} mt-3`} onClick={() => void documents.refetch()}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <DocumentSection
              heading="Owned by me"
              documents={documents.data.owned}
              empty="You have no documents yet. Create one or import a file."
            />
            <DocumentSection
              heading="Shared with me"
              documents={documents.data.shared}
              empty="Nothing has been shared with you yet."
            />
          </>
        )}
      </main>
    </div>
  );
}

function DocumentSection({
  heading,
  documents,
  empty,
}: {
  heading: string;
  documents: DocumentSummary[];
  empty: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{heading}</h2>
      {documents.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
          {empty}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {documents.map((document) => (
            <DocumentRow key={document.id} document={document} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DocumentRow({ document }: { document: DocumentSummary }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.deleteDocument(document.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });
  const title = document.title || "Untitled document";

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 hover:bg-slate-50">
      <Link to={`/d/${document.id}`} className={`min-w-0 flex-1 rounded ${focusRing}`}>
        <span className="block truncate font-medium text-slate-900">{title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
          {document.role === "owner" ? (
            document.shareCount > 0 && (
              <span>
                Shared with {document.shareCount} {document.shareCount === 1 ? "person" : "people"}
              </span>
            )
          ) : (
            <>
              <span>{document.owner.name}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                {roleLabels[document.role]}
              </span>
            </>
          )}
          <span>Updated {formatRelativeTime(document.updatedAt)}</span>
        </span>
      </Link>
      {document.role === "owner" &&
        (confirming ? (
          <span className="flex items-center gap-2">
            <span className="text-sm text-slate-700">Delete this document?</span>
            <button
              type="button"
              className={`${dangerButton} py-1.5`}
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? "Deleting..." : "Delete"}
            </button>
            <button
              type="button"
              className={`${secondaryButton} py-1.5`}
              disabled={remove.isPending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            className={`rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-red-700 ${focusRing}`}
            aria-label={`Delete ${title}`}
            title="Delete"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        ))}
      {remove.error && (
        <p role="alert" className="w-full text-sm text-red-700">
          {remove.error.message}
        </p>
      )}
    </li>
  );
}
