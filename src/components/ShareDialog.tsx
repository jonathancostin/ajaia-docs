import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui-sdk/react/button";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/react/dialog";
import { Field, FieldLabel } from "@ui-sdk/react/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui-sdk/react/select";
import { Share2, X } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import type { ShareRole } from "../api";
import { roleLabels } from "../lib/format";

const roleItems = (["editor", "viewer"] as const).map((value) => ({ value, label: roleLabels[value] }));

function RoleSelectContent() {
  return (
    <SelectContent>
      {roleItems.map((item) => (
        <SelectItem key={item.value} value={item.value}>
          {item.label}
        </SelectItem>
      ))}
    </SelectContent>
  );
}

export function ShareDialog({ documentId, isOwner }: { documentId: string; isOwner: boolean }) {
  return (
    <Dialog>
      <DialogTrigger data-variant="solid">
        <Share2 aria-hidden />
        Share
      </DialogTrigger>
      <DialogBackdrop />
      <DialogContent className="w-[min(32rem,calc(100%-2rem))] gap-0">
        <SharePanel documentId={documentId} isOwner={isOwner} />
      </DialogContent>
    </Dialog>
  );
}

function SharePanel({ documentId, isOwner }: { documentId: string; isOwner: boolean }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<ShareRole>("editor");

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
  const error = setShare.error ?? removeShare.error ?? users.error;

  const people = (users.data?.users ?? [])
    .filter(
      (person) =>
        person.id !== shares.data?.owner.id && !shares.data?.shares.some((share) => share.user.id === person.id),
    )
    .map((person) => ({ value: person.email, label: `${person.name} (${person.email})` }));

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <DialogTitle>Share document</DialogTitle>
        <DialogClose aria-label="Close" className="border-transparent">
          <X aria-hidden />
        </DialogClose>
      </div>

      {isOwner ? (
        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!email) return;
            removeShare.reset();
            setShare.mutate({ email, role }, { onSuccess: () => setEmail(null) });
          }}
        >
          <Field className="min-w-48 flex-1">
            <FieldLabel>Person</FieldLabel>
            <Select
              items={people}
              value={email}
              onValueChange={setEmail}
              disabled={users.isPending}
              placeholder={users.isPending ? "Loading people..." : "Choose a person"}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {people.map((person) => (
                  <SelectItem key={person.value} value={person.value}>
                    {person.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Role</FieldLabel>
            <Select items={roleItems} value={role} onValueChange={(value) => value && setRole(value)}>
              <SelectTrigger className="min-w-32">
                <SelectValue />
              </SelectTrigger>
              <RoleSelectContent />
            </Select>
          </Field>
          <Button type="submit" data-variant="solid" disabled={!email || busy}>
            Add
          </Button>
        </form>
      ) : (
        <p className="mt-3 text-sm text-slate-600">Only the owner can change sharing.</p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}

      <h3 className="mt-5 text-sm font-semibold text-slate-900">People with access</h3>
      {shares.isPending ? (
        <p className="mt-2 text-sm text-slate-600">Loading...</p>
      ) : shares.isError ? (
        <div role="alert" className="mt-2 text-sm text-slate-700">
          <p>{shares.error.message}</p>
          <Button className="mt-2" onClick={() => shares.refetch()}>
            Try again
          </Button>
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
                  <Select
                    items={roleItems}
                    value={share.role}
                    disabled={busy}
                    onValueChange={(value) => {
                      if (!value) return;
                      removeShare.reset();
                      setShare.mutate({ email: share.user.email, role: value });
                    }}
                  >
                    <SelectTrigger aria-label={`Role for ${share.user.name}`} className="min-w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <RoleSelectContent />
                  </Select>
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setShare.reset();
                      removeShare.mutate(share.user.id);
                    }}
                  >
                    Remove <span className="sr-only">{share.user.name}</span>
                  </Button>
                </>
              ) : (
                <span className="text-sm text-slate-600">{roleLabels[share.role]}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
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
