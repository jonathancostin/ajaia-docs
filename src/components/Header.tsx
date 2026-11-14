import { Button } from "@ui-sdk/react/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@ui-sdk/react/menu";
import { FileText, LogOut, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { DEMO_ACCOUNTS } from "../demoAccounts";
import { signOut, switchUser, useUser } from "../session";

export function Header() {
  const user = useUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        <Link to="/" className="flex shrink-0 items-center gap-2 rounded font-semibold text-slate-900 no-underline">
          <FileText className="size-5 text-blue-600" aria-hidden />
          Ajaia Docs
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <div className="min-w-0 text-right leading-tight">
            <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <Menu onAction={(email) => void run(() => switchUser(email))}>
            <MenuTrigger className="shrink-0" disabled={busy}>
              <Users aria-hidden />
              <span className="sr-only sm:not-sr-only">Switch user</span>
            </MenuTrigger>
            <MenuContent align="end" className="w-64">
              {DEMO_ACCOUNTS.filter((account) => account.email !== user.email).map((account) => (
                <MenuItem
                  key={account.email}
                  value={account.email}
                  label={account.name}
                  className="h-auto flex-col items-start gap-0 py-1.5"
                >
                  <span className="block text-sm font-medium text-slate-900">Sign in as {account.name}</span>
                  <span className="block text-xs text-slate-600">{account.note}</span>
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
          <Button className="shrink-0" disabled={busy} onClick={() => run(signOut)}>
            <LogOut aria-hidden />
            <span className="sr-only sm:not-sr-only">Sign out</span>
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mx-auto max-w-6xl px-4 pb-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </header>
  );
}
