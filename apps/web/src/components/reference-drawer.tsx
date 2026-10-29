"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CaptureMetadata } from "@justcreate/shared";
import {
  addReferencesToBoard,
  deleteReference,
  removeFromBoard,
  updateReference,
} from "@/lib/actions";
import type { ReferenceView } from "@/lib/references";
import { safeHost } from "./reference-card";

/**
 * Side drawer for one reference: large preview, source link, editable title / note / labels /
 * description, AI analysis, and board actions. Render with `key={reference.id}` so the form
 * resets when another reference is opened.
 */
export function ReferenceDrawer({
  reference: r,
  onClose,
  onBoard = false,
  docked = false,
}: {
  reference: ReferenceView;
  onClose: () => void;
  /** Render as a column in the page layout instead of an overlay (board workspace). */
  docked?: boolean;
  /** True when the reference is on the board: offers "remove from board" instead of "put on board". */
  onBoard?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(r.title ?? "");
  const [note, setNote] = useState(r.note ?? "");
  const [description, setDescription] = useState(r.description ?? "");
  const [labels, setLabels] = useState(r.labels.join(", "));
  const [status, setStatus] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = r.metadata as CaptureMetadata;
  const link = r.source_url ?? r.page_url;
  const run = (fn: () => Promise<unknown>, done = "Saved") =>
    start(async () => {
      try {
        await fn();
        setStatus(done);
        router.refresh();
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Something went wrong");
      }
    });

  const save = () =>
    run(() =>
      updateReference(r.id, {
        title,
        note,
        description,
        labels: labels.split(","),
      }),
    );

  return (
    <aside
      aria-label="Reference details"
      className={
        docked
          ? "flex w-96 shrink-0 flex-col overflow-y-auto border-l border-foreground/20 bg-background"
          : "fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col overflow-y-auto border-l border-foreground/20 bg-background shadow-2xl"
      }
    >
      <div className="flex items-center justify-between border-b border-foreground/20 px-4 py-3">
        <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-xs uppercase tracking-wide">{r.type}</span>
        <button onClick={onClose} className="text-sm text-foreground/60 hover:text-foreground" aria-label="Close">
          Close ✕
        </button>
      </div>

      {(r.fileUrl ?? r.imageUrl) && (
        <a href={r.fileUrl ?? r.imageUrl} target="_blank" rel="noreferrer" className="block bg-foreground/5">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs */}
          <img src={r.imageUrl ?? r.fileUrl} alt={r.title ?? ""} className="mx-auto max-h-[50vh] w-auto" />
        </a>
      )}

      <div className="flex flex-col gap-4 p-4 text-sm">
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="truncate text-foreground/70 underline">
            {safeHost(link) ?? link}
          </a>
        )}
        {r.type === "video" && meta.timestampSeconds ? (
          <a href={link ?? "#"} target="_blank" rel="noreferrer" className="text-foreground/70 underline">
            Open at {formatTime(meta.timestampSeconds)}
          </a>
        ) : null}
        {r.type === "tweet" && meta.text && (
          <blockquote className="whitespace-pre-line border-l-2 border-foreground/20 pl-3 text-foreground/80">
            {meta.text}
            {meta.author && <footer className="mt-1 text-xs text-foreground/50">— {meta.author} {meta.handle}</footer>}
          </blockquote>
        )}

        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Note">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={inputClass} />
        </Field>
        <Field label="Labels (comma separated)">
          <input value={labels} onChange={(e) => setLabels(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={inputClass}
          />
        </Field>
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={pending}
            className="rounded-md bg-foreground px-3 py-1.5 font-medium text-background disabled:opacity-50"
          >
            Save
          </button>
          {status && <span className="text-xs text-foreground/60">{status}</span>}
        </div>

        {r.analysis && (
          <section className="flex flex-col gap-2 border-t border-foreground/20 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/60">AI analysis</h3>
            {r.analysis.caption && <p className="text-foreground/80">{r.analysis.caption}</p>}
            {r.analysis.palette.length > 0 && (
              <div className="flex gap-1" aria-label="Palette">
                {r.analysis.palette.map((hex) => (
                  <span
                    key={hex}
                    title={hex}
                    className="h-6 w-6 rounded sketch border-foreground/70"
                    style={{ background: hex }}
                  />
                ))}
              </div>
            )}
            <TagRow label="Tags" values={r.analysis.tags} />
            <TagRow label="Mood" values={r.analysis.mood} />
            <TagRow label="Components" values={r.analysis.components} />
            <TagRow label="Effects" values={r.analysis.effects} />
            <TagRow label="Fonts" values={r.analysis.fonts} />
          </section>
        )}

        <section className="flex flex-col gap-2 border-t border-foreground/20 pt-4">
          {onBoard ? (
            <button
              onClick={() => run(async () => (await removeFromBoard(r.id), onClose()), "Removed")}
              className={`self-start text-xs ${linkClass}`}
            >
              Remove from board
            </button>
          ) : (
            <button
              onClick={() => run(() => addReferencesToBoard([r.id]), "On the board")}
              className={`self-start text-xs ${linkClass}`}
            >
              Put on the board
            </button>
          )}
          <button
            onClick={() => {
              if (window.confirm("Delete this reference everywhere? This can't be undone.")) {
                run(async () => (await deleteReference(r.id), onClose()), "Deleted");
              }
            }}
            className="self-start text-xs text-red-600 underline"
          >
            Delete reference
          </button>
        </section>
      </div>
    </aside>
  );
}

const inputClass = "w-full rounded-md sketch border-foreground/70 bg-transparent px-2 py-1.5";
const linkClass = "text-foreground/70 underline hover:text-foreground";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-foreground/60">
      {label}
      <span className="text-sm text-foreground">{children}</span>
    </label>
  );
}

function TagRow({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <p className="text-xs">
      <span className="text-foreground/50">{label}: </span>
      {values.join(", ")}
    </p>
  );
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
