import { zValidator } from "@hono/zod-validator";
import type { z } from "zod";
import { HttpError } from "./errors.ts";

/**
 * Parses the JSON body with a zod schema. A failed parse becomes a 400 whose
 * message is the first problem. Problems inside document content get a plain
 * sentence plus the path, because zod's own wording there means little to a user.
 */
export const jsonBody = <Schema extends z.ZodType>(schema: Schema) =>
  zValidator("json", schema, (result) => {
    if (result.success) return;
    const issue = result.error.issues[0];
    const inContent = issue?.path[0] === "content" && issue.code !== "custom";
    const message = inContent
      ? `This document contains something the editor does not support (${issue.path.join(".")}).`
      : (issue?.message ?? "That request is not valid.");
    throw new HttpError(400, "invalid", message);
  });
