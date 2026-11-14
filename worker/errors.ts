import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ErrorCode =
  | "unauthenticated"
  | "invalid_credentials"
  | "forbidden"
  | "not_found"
  | "invalid"
  | "too_large";

// Thrown anywhere below a route and turned into a JSON response in one place
// (the onError handler in index.ts). `extra` is merged into the response body.
export class HttpError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ErrorCode;
  readonly extra?: Record<string, unknown>;

  constructor(status: ContentfulStatusCode, code: ErrorCode, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

// A document the user cannot see and a document that does not exist get the
// same answer, so the API never confirms that a document id is real.
export const documentNotFound = () =>
  new HttpError(404, "not_found", "This document does not exist or you do not have access to it.");
