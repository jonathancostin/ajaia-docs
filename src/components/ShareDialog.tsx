import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { ShareRole } from "../api";
import { roleLabels } from "../lib/format";
import { focusRing, inputClass, primaryButton, secondaryButton } from "../styles";

export function ShareDialog({
  documentId,
  isOwner,
  onClose,
}: {
  documentId: string;
  isOwner: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("editor");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const shares = useQuery({ queryKey: ["shares", documentId], queryFn: () => api.listShares(documentId) });
  const users = useQuery({ queryKey: ["users"], queryFn: api.users, enabled: isOwner, staleTime: 60_000 });

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["shares", documentId] }),
      queryClient.invalidateQueries({ queryKey: ["documents"] }),
    ]);
  const setShare = useMutation({
    mutationFn: (input: { email: string; role: ShareRole }) => api.setShare(documentId, input.email, input.role),
    onSuccess: invalidate,
  });
  const removeShare = useMutation({
    mutationFn: (userId: string) => api.removeShare(documentId, userId),
    onSuccess: invalidate,
  });
  const busy = setShare.isPending || removeShare.isPending;
  const mutationError = setShare.error ?? removeShare.error;

  const people = (users.data?.users ?? []).filter(
    (person) =>
      person.id !== shares.data?.owner.id && !shares.data?.shares.some((share) => share.user.id === person.id),
  );

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="share-title"
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg bg-white p-0 text-slate-800 shadow-xl backdrop:bg-slate-900/40"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="share-title" className="text-lg font-semibold text-slate-900">
            Share document
          </h2>
          <button
            type="button"
            aria-label="Close"
            title="Close"
            className={`rounded-md p-1.5 text-slate-500 hover:bg-slate-100 ${focusRing}`}
            onClick={() => dialogRef.current?.close()}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {isOwner ? (
          <form
            className="mt-4 flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!email) return;
              removeShare.reset();
              setShare.mutate({ email, role }, { onSuccess: () => setEmail("") });
            }}
          >
            <label className="sr-only" htmlFor="share-person">
              Person
            </label>
            <select
              id="share-person"
              className={`${inputClass} min-w-0 flex-1`}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={users.isPending}
            >
              <option value="">{users.isPending ? "Loading people..." : "Choose a person"}</option>
              {people.map((person) => (
                <option key={person.id} value={person.email}>
                  {person.name} ({person.email})
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="share-role">
              Role
            </label>
            <select
              id="share-role"
              className={inputClass}
              value={role}
              onChange={(event) => setRole(event.target.value as ShareRole)}
            >
              <option value="editor">{roleLabels.editor}</option>
              <option value="viewer">{roleLabels.viewer}</option>
            </select>
            <button type="submit" className={primaryButton} disabled={!email || busy}>
              Add
            </button>
          </form>
        ) : (
          <p className="mt-3 text-sm text-slate-600">Only the owner can change sharing.</p>
        )}

        {(mutationError ?? users.error) && (
          <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {(mutationError ?? users.error)?.message}
          </p>
        )}

        <h3 className="mt-5 text-sm font-semibold text-slate-900">People with access</h3>
        {shares.isPending ? (
          <p className="mt-2 text-sm text-slate-600">Loading...</p>
        ) : shares.isError ? (
          <div role="alert" className="mt-2 text-sm text-slate-700">
            <p>{shares.error.message}</p>
            <button type="button" className={`${secondaryButton} mt-2`} onClick={() => void shares.refetch()}>
              Try again
            </button>
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-slate-200">
            <li className="flex items-center gap-3 py-2.5">
              <PersonLabel name={shares.data.owner.name} email={shares.data.owner.email} />
              <span className="text-sm text-slate-600">Owner</span>
            </li>
            {shares.data.shares.map((share) => (
              <li key={share.user.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                <PersonLabel name={share.user.name} email={share.user.email} />
                {isOwner ? (
                  <>
                    <select
                      aria-label={`Role for ${share.user.name}`}
                      className={`${inputClass} py-1.5`}
                      value={share.role}
                      disabled={busy}
                      onChange={(event) => {
                        removeShare.reset();
                        setShare.mutate({ email: share.user.email, role: event.target.value as ShareRole });
                      }}
                    >
                      <option value="editor">{roleLabels.editor}</option>
                      <option value="viewer">{roleLabels.viewer}</option>
                    </select>
                    <button
                      type="button"
                      className={`${secondaryButton} py-1.5`}
                      disabled={busy}
                      onClick={() => {
                        setShare.reset();
                        removeShare.mutate(share.user.id);
                      }}
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <span className="text-sm text-slate-600">{roleLabels[share.role]}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}

function PersonLabel({ name, email }: { name: string; email: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium text-slate-900">{name}</span>
      <span className="block truncate text-xs text-slate-500">{email}</span>
    </span>
  );
}
