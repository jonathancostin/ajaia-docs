import { FileText, LogOut, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { DEMO_ACCOUNTS } from "../demoAccounts";
import { signOut, switchUser, useUser } from "../session";
import { focusRing, secondaryButton } from "../styles";

export function Header() {
  const user = useUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  async function run(action: () => Promise<void>) {
    setMenuOpen(false);
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
        <Link to="/" className={`flex shrink-0 items-center gap-2 rounded font-semibold text-slate-900 ${focusRing}`}>
          <FileText className="size-5 text-blue-600" aria-hidden />
          Ajaia Docs
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <div className="min-w-0 text-right leading-tight">
            <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              className={`${secondaryButton} px-2.5`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              disabled={busy}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Users className="size-4" aria-hidden />
              <span className="sr-only sm:not-sr-only">Switch user</span>
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute top-full right-0 z-30 mt-1 w-64 rounded-md border border-slate-200 bg-white py-1 shadow-lg"
              >
                {DEMO_ACCOUNTS.filter((account) => account.email !== user.email).map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    role="menuitem"
                    className={`block w-full px-3 py-2 text-left hover:bg-slate-50 ${focusRing}`}
                    onClick={() => void run(() => switchUser(account.email))}
                  >
                    <span className="block text-sm font-medium text-slate-900">Sign in as {account.name}</span>
                    <span className="block text-xs text-slate-500">{account.note}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className={`${secondaryButton} shrink-0 px-2.5`}
            disabled={busy}
            onClick={() => void run(signOut)}
          >
            <LogOut className="size-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">Sign out</span>
          </button>
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
