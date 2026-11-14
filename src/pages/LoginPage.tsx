import { useMutation } from "@tanstack/react-query";
import { Button } from "@ui-sdk/react/button";
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field";
import { Input } from "@ui-sdk/react/input";
import { PasswordInput, PasswordInputControl, PasswordInputToggle } from "@ui-sdk/react/password-input";
import { FileText } from "lucide-react";
import { useState } from "react";
import { Navigate, useLocation } from "react-router";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../demoAccounts";
import { signIn, useSession } from "../session";

export function LoginPage() {
  const session = useSession();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: (credentials: { email: string; password: string }) => signIn(credentials.email, credentials.password),
  });

  if (session.isPending) return null;
  if (session.data) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? "/"} replace />;
  }

  const pendingEmail = login.isPending ? login.variables.email : null;

  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-2 text-slate-900">
          <FileText className="size-7 text-blue-600" aria-hidden />
          <h1 className="text-2xl font-semibold">Ajaia Docs</h1>
        </div>
        <p className="mt-2 text-slate-600">Write documents and share them with your team.</p>

        {login.error && (
          <p role="alert" className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {login.error.message}
          </p>
        )}

        <h2 className="mt-8 text-sm font-semibold text-slate-900">Sign in with a demo account</h2>
        <p className="mt-1 text-sm text-slate-600">
          A browser holds one sign-in for all its windows. To be two people at once and see live editing, open a
          private window or a second browser.
        </p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email} className="flex flex-col rounded-lg border border-slate-200 bg-white p-4">
              <p className="font-medium text-slate-900">{account.name}</p>
              <p className="text-sm break-all text-slate-500">{account.email}</p>
              <p className="mt-2 flex-1 text-sm text-slate-600">{account.note}</p>
              <Button
                data-variant="solid"
                className="mt-4"
                disabled={login.isPending}
                onClick={() => login.mutate({ email: account.email, password: DEMO_PASSWORD })}
              >
                {pendingEmail === account.email ? "Signing in..." : `Sign in as ${account.name.split(" ")[0]}`}
              </Button>
            </li>
          ))}
        </ul>

        <form
          className="mt-8 flex max-w-sm flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate({ email, password });
          }}
        >
          <h2 className="text-sm font-semibold text-slate-900">Sign in with email</h2>
          <Field>
            <FieldLabel>Email</FieldLabel>
            <Input type="email" required autoComplete="username" value={email} onValueChange={setEmail} />
          </Field>
          <Field>
            <FieldLabel>Password</FieldLabel>
            <PasswordInput required value={password} onValueChange={setPassword}>
              <PasswordInputControl placeholder={DEMO_PASSWORD} />
              <PasswordInputToggle aria-label="Show password" />
            </PasswordInput>
            <FieldDescription className="text-xs">
              Every demo account uses the password <code>{DEMO_PASSWORD}</code>.
            </FieldDescription>
          </Field>
          <Button type="submit" className="mt-1 w-full" disabled={login.isPending}>
            {login.isPending && pendingEmail === email ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
