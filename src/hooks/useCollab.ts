import { useEffect, useRef, useState } from "react";
import YProvider from "y-partyserver/provider";
import * as Y from "yjs";
import { COLLAB_META } from "../lib/extensions";

export interface SavedMessage {
  type: "saved";
  version: number;
  updatedAt: number;
  updatedBy: { id: string; name: string } | null;
}

export interface CollabRoom {
  ydoc: Y.Doc;
  provider: YProvider;
}

const ACCESS_CHANGED = 4403;
const DOCUMENT_DELETED = 4404;

// Joins the document's real-time room. `pending` is true from a local change
// until the server says it wrote the document to the database.
export function useCollab(
  documentId: string,
  handlers: {
    onSaved: (message: SavedMessage) => void;
    // The server closed the room because this user's access changed or the document is gone.
    onAccessChanged: () => void;
    // The room could not be reached before its first sync.
    onUnreachable: () => void;
  },
) {
  const [room, setRoom] = useState<CollabRoom | null>(null);
  const [synced, setSynced] = useState(false);
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const handlersRef = useRef(handlers);
  const pendingRef = useRef(false);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const ydoc = new Y.Doc();
    const provider = new YProvider(window.location.host, documentId, ydoc, { prefix: `/api/collab/${documentId}` });
    let everSynced = false;
    const markPending = (value: boolean) => {
      pendingRef.current = value;
      setPending(value);
    };

    const onSynced = (state: boolean) => {
      if (!state) return;
      everSynced = true;
      setSynced(true);
    };
    const onStatus = ({ status }: { status: string }) => setConnected(status === "connected");
    // Updates the provider applies came from the server; anything else was made here.
    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      if (everSynced && origin !== provider) markPending(true);
    };
    const onMessage = (raw: string) => {
      let message: unknown;
      try {
        message = JSON.parse(raw);
      } catch {
        return;
      }
      if (isSaveFailedMessage(message)) {
        setSaveError(message.message);
        return;
      }
      if (!isSavedMessage(message)) return;
      markPending(false);
      setSaveError(null);
      handlersRef.current.onSaved(message);
    };
    const onClose = (event: CloseEvent) => {
      if (event.code === ACCESS_CHANGED || event.code === DOCUMENT_DELETED) {
        provider.disconnect();
        handlersRef.current.onAccessChanged();
      } else if (!everSynced) {
        handlersRef.current.onUnreachable();
      }
    };
    const onError = () => {
      if (!everSynced) handlersRef.current.onUnreachable();
    };

    provider.on("synced", onSynced);
    provider.on("status", onStatus);
    provider.on("custom-message", onMessage);
    provider.on("connection-close", onClose);
    provider.on("connection-error", onError);
    ydoc.on("update", onUpdate);
    setConnected(provider.wsconnected);
    if (provider.synced) onSynced(true);
    setRoom({ ydoc, provider });

    return () => {
      provider.off("synced", onSynced);
      provider.off("status", onStatus);
      provider.off("custom-message", onMessage);
      provider.off("connection-close", onClose);
      provider.off("connection-error", onError);
      ydoc.off("update", onUpdate);
      provider.destroy();
      ydoc.destroy();
      setRoom(null);
      setSynced(false);
      setConnected(false);
      markPending(false);
      setSaveError(null);
    };
  }, [documentId]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingRef.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return { room, synced, connected, pending, saveError };
}

function isSavedMessage(value: unknown): value is SavedMessage {
  return typeof value === "object" && value !== null && "type" in value && value.type === "saved";
}

function isSaveFailedMessage(value: unknown): value is { type: "save-failed"; message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "save-failed" &&
    "message" in value &&
    typeof value.message === "string"
  );
}

const MAX_TITLE_LENGTH = 200;
const EMPTY_TITLE = "Untitled document";

// The title lives in the shared document, so every open editor sees it change.
export function useCollabTitle(ydoc: Y.Doc) {
  const meta = ydoc.getMap<string>(COLLAB_META);
  const [title, setTitle] = useState(() => meta.get("title") ?? "");

  useEffect(() => {
    const onChange = () => setTitle(meta.get("title") ?? "");
    meta.observe(onChange);
    onChange();
    return () => meta.unobserve(onChange);
  }, [meta]);

  return {
    title,
    change: (value: string) => meta.set("title", value.slice(0, MAX_TITLE_LENGTH)),
    commit: () => {
      const trimmed = (meta.get("title") ?? "").trim();
      const next = trimmed || EMPTY_TITLE;
      if (next !== meta.get("title")) meta.set("title", next);
    },
  };
}
