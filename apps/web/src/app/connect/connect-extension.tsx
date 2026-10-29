"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CONNECT_MESSAGE, type ExtensionSession } from "@justcreate/shared";

type Status = "connecting" | "connected" | "no-extension" | "error";

/**
 * Asks the server for a fresh extension session and posts it to this window, where the
 * extension's content script (only injected on this origin's /connect page) picks it up.
 */
export function ConnectExtension() {
  const [status, setStatus] = useState<Status>("connecting");
  const [message, setMessage] = useState("");

  const connect = useCallback(async () => {
    setStatus("connecting");
    const res = await fetch("/api/extension/session", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { session?: ExtensionSession; error?: string };
    if (!body.session) {
      setStatus("error");
      setMessage(body.error ?? "Could not create a session.");
      return;
    }

    const ack = new Promise<{ error?: string } | null>((resolve) => {
      const onAck = (event: MessageEvent) => {
        if (event.source === window && event.data?.type === `${CONNECT_MESSAGE}_ACK`) {
          window.removeEventListener("message", onAck);
          resolve({ error: event.data.error });
        }
      };
      window.addEventListener("message", onAck);
      // Generous: the extension's service worker may need to wake up first.
      window.setTimeout(() => resolve(null), 10_000);
    });
    window.postMessage({ type: CONNECT_MESSAGE, session: body.session }, window.location.origin);
    const result = await ack;
    if (result && !result.error) return setStatus("connected");

    const present = document.documentElement.dataset.justcreateExtension === "ready";
    if (!present) return setStatus("no-extension");
    setStatus("error");
    setMessage(`The extension is installed but couldn't save the session: ${result?.error ?? "no response"}`);
  }, []);

  // Run once even under React Strict Mode: two overlapping requests would each mint a
  // one-time token, and the second invalidates the first.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void connect();
  }, [connect]);

  return (
    <div className="flex flex-col gap-3 text-sm">
      {status === "connecting" && <p>Connecting…</p>}
      {status === "connected" && <p>Extension connected. You can close this tab.</p>}
      {status === "no-extension" && (
        <p>
          The extension didn&apos;t answer. Make sure it&apos;s installed and enabled, reload this page, and
          try again.
        </p>
      )}
      {status === "error" && <p className="text-red-600">{message}</p>}
      {(status === "no-extension" || status === "error") && (
        <button onClick={connect} className="self-start rounded-md sketch border-foreground/70 px-3 py-1.5">
          Try again
        </button>
      )}
    </div>
  );
}
