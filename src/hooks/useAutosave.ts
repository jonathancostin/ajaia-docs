import type { JSONContent } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import type { DocumentMeta } from "../api";
import { handleApiError, pendingSaves } from "../session";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error" | "conflict";

export interface Draft {
  title: string;
  content: JSONContent;
}

const SAVE_DELAY_MS = 800;

/**
 * Saves a document a moment after the last change. Only one save runs at a
 * time; changes made during a save are saved when it returns. A conflict
 * stops saving until the user picks a version.
 */
export function useAutosave(options: {
  id: string;
  version: number;
  getDraft: () => Draft;
  onSaved: (document: DocumentMeta) => void;
}) {
  const { id } = options;
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [conflict, setConflict] = useState<ApiError | null>(null);

  const versionRef = useRef(options.version);
  const dirtyRef = useRef(false);
  const forceRef = useRef(false);
  const stoppedRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const callbacksRef = useRef(options);
  useEffect(() => {
    callbacksRef.current = options;
  });

  const save = useCallback((): Promise<void> => {
    window.clearTimeout(timerRef.current);
    if (inFlightRef.current) return inFlightRef.current;

    const run = async () => {
      while (dirtyRef.current && !stoppedRef.current) {
        dirtyRef.current = false;
        const force = forceRef.current;
        forceRef.current = false;
        setStatus("saving");
        try {
          const { document } = await api.updateDocument(id, {
            ...callbacksRef.current.getDraft(),
            baseVersion: versionRef.current,
            force,
          });
          versionRef.current = document.version;
          callbacksRef.current.onSaved(document);
        } catch (error) {
          dirtyRef.current = true;
          if (error instanceof ApiError && error.code === "conflict") {
            stoppedRef.current = true;
            setConflict(error);
            setStatus("conflict");
          } else {
            handleApiError(error);
            setStatus("error");
          }
          return;
        }
      }
      if (!stoppedRef.current) setStatus("saved");
    };

    const promise = run().finally(() => {
      inFlightRef.current = null;
    });
    inFlightRef.current = promise;
    return promise;
  }, [id]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    if (stoppedRef.current) return;
    if (!inFlightRef.current) setStatus("unsaved");
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void save(), SAVE_DELAY_MS);
  }, [save]);

  const keepMine = useCallback(() => {
    stoppedRef.current = false;
    forceRef.current = true;
    dirtyRef.current = true;
    setConflict(null);
    void save();
  }, [save]);

  /** Accepts a version loaded from the server in place of local changes. */
  const acceptVersion = useCallback((version: number) => {
    window.clearTimeout(timerRef.current);
    versionRef.current = version;
    dirtyRef.current = false;
    stoppedRef.current = false;
    setConflict(null);
    setStatus("saved");
  }, []);

  useEffect(() => {
    pendingSaves.add(save);
    return () => {
      pendingSaves.delete(save);
      window.clearTimeout(timerRef.current);
      // Leaving the page: save what is left.
      if (dirtyRef.current && !stoppedRef.current) void save();
    };
  }, [save]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current || inFlightRef.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return { status, conflict, markDirty, retry: save, keepMine, acceptVersion };
}
