import { Link } from "react-router";
import { primaryButton } from "../styles";

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold text-slate-900">Page not found</h1>
        <p className="mt-2 text-slate-600">There is nothing at this address.</p>
        <Link to="/" className={`${primaryButton} mt-5`}>
          Go to your documents
        </Link>
      </div>
    </main>
  );
}
