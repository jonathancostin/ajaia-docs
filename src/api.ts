// Typed client for the Worker API. Every call sends the session cookie and
// turns a non-2xx response into an ApiError the UI can show.
import type { JSONContent } from "@tiptap/core";

export type Role = "owner" | "editor" | "viewer";
export type ShareRole = "editor" | "viewer";

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  role: Role;
  owner: User;
  updatedAt: number;
  /** How many people the document is shared with. */
  shareCount: number;
}

export interface DocumentMeta extends DocumentSummary {
  version: number;
  createdAt: number;
  updatedBy: { id: string; name: string } | null;
}

export interface DocumentDetail extends DocumentMeta {
  content: JSONContent;
}

export interface Share {
  user: User;
  role: ShareRole;
}

/** An earlier state of a document, kept when a later save replaced it. */
export interface VersionSummary {
  id: string;
  title: string;
  savedAt: number;
  savedBy: { id: string; name: string } | null;
}

export interface VersionDetail extends VersionSummary {
  content: JSONContent;
}

export type ErrorCode =
  | "unauthenticated"
  | "invalid_credentials"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid"
  | "too_large"
  | "network"
  | "server";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  /** On a 409, the version now on the server and who saved it. */
  readonly current?: Pick<DocumentMeta, "version" | "updatedAt" | "updatedBy">;

  constructor(status: number, code: ErrorCode, message: string, current?: ApiError["current"]) {
    super(message);
    this.status = status;
    this.code = code;
    this.current = current;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network", "Could not reach the server. Check your connection and try again.");
  }
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => null)) as
    | { error?: { code: ErrorCode; message: string }; current?: ApiError["current"] }
    | null;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error?.code ?? "server",
      data?.error?.message ?? "Something went wrong. Please try again.",
      data?.current,
    );
  }
  return data as T;
}

export const api = {
  me: () => request<{ user: User }>("GET", "/me"),
  login: (email: string, password: string) => request<{ user: User }>("POST", "/auth/login", { email, password }),
  logout: () => request<void>("POST", "/auth/logout"),
  /** Everyone who can be shared with. Fine for an internal tool with a known team. */
  users: () => request<{ users: User[] }>("GET", "/users"),

  listDocuments: () => request<{ owned: DocumentSummary[]; shared: DocumentSummary[] }>("GET", "/documents"),
  createDocument: (input: { title?: string; content?: JSONContent }) =>
    request<{ document: DocumentDetail }>("POST", "/documents", input),
  getDocument: (id: string) => request<{ document: DocumentDetail }>("GET", `/documents/${id}`),
  /**
   * Saves a title, content or both. `baseVersion` is the version this client
   * loaded. If someone saved since, the server answers 409 and nothing changes.
   * `force` saves anyway.
   */
  updateDocument: (
    id: string,
    input: { title?: string; content?: JSONContent; baseVersion: number; force?: boolean },
  ) => request<{ document: DocumentMeta }>("PATCH", `/documents/${id}`, input),
  deleteDocument: (id: string) => request<void>("DELETE", `/documents/${id}`),

  listShares: (id: string) => request<{ owner: User; shares: Share[] }>("GET", `/documents/${id}/shares`),
  /** Grants access or changes the role of someone who already has it. Owner only. */
  setShare: (id: string, email: string, role: ShareRole) =>
    request<{ share: Share }>("PUT", `/documents/${id}/shares`, { email, role }),
  removeShare: (id: string, userId: string) => request<void>("DELETE", `/documents/${id}/shares/${userId}`),

  listVersions: (id: string) => request<{ versions: VersionSummary[] }>("GET", `/documents/${id}/versions`),
  getVersion: (id: string, versionId: string) =>
    request<{ version: VersionDetail }>("GET", `/documents/${id}/versions/${versionId}`),
  /** Puts an earlier version back. The state it replaces is kept as a version, so this can be undone. */
  restoreVersion: (id: string, versionId: string) =>
    request<{ document: DocumentDetail }>("POST", `/documents/${id}/versions/${versionId}/restore`),
};
