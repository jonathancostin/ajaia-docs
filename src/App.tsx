import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { DocumentsPage } from "./pages/DocumentsPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { queryClient, RequireSession } from "./session";

// A separate chunk keeps TipTap out of the login and document list bundle.
const EditorPage = lazy(() => import("./pages/EditorPage").then((module) => ({ default: module.EditorPage })));

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireSession />}>
            <Route path="/" element={<DocumentsPage />} />
            <Route
              path="/d/:id"
              element={
                <Suspense fallback={<p className="p-8 text-center text-slate-600">Loading editor...</p>}>
                  <EditorPage />
                </Suspense>
              }
            />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
