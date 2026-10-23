"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { REFERENCE_TYPES } from "@justcreate/shared";

/** Search box + type / label / date filters, all kept in the URL so views are linkable. */
export function FiltersBar({ labels, showInbox = true }: { labels: string[]; showInbox?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`);
  };

  // Debounced search-as-you-type.
  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const id = window.setTimeout(() => set("q", q.trim() || null), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [q]);

  const type = params.get("type");
  const inbox = params.get("view") === "inbox";

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search title, note, labels…"
        aria-label="Search"
        className="w-full rounded-md border border-foreground/20 bg-transparent px-3 py-1.5 sm:w-64"
      />
      {showInbox && (
        <Chip label="Inbox" active={inbox} onClick={() => set("view", inbox ? null : "inbox")} />
      )}
      <Chip label="All types" active={!type} onClick={() => set("type", null)} />
      {REFERENCE_TYPES.map((t) => (
        <Chip key={t} label={t} active={type === t} onClick={() => set("type", type === t ? null : t)} />
      ))}
      {labels.length > 0 && (
        <select
          value={params.get("label") ?? ""}
          onChange={(e) => set("label", e.target.value || null)}
          aria-label="Filter by label"
          className="rounded-md border border-foreground/20 bg-transparent px-2 py-1.5"
        >
          <option value="">Any label</option>
          {labels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      )}
      <label className="flex items-center gap-1 text-foreground/60">
        From
        <input
          type="date"
          value={params.get("from") ?? ""}
          onChange={(e) => set("from", e.target.value || null)}
          className="rounded-md border border-foreground/20 bg-transparent px-2 py-1"
        />
      </label>
      <label className="flex items-center gap-1 text-foreground/60">
        To
        <input
          type="date"
          value={params.get("to") ?? ""}
          onChange={(e) => set("to", e.target.value || null)}
          className="rounded-md border border-foreground/20 bg-transparent px-2 py-1"
        />
      </label>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 capitalize ${
        active ? "border-foreground bg-foreground text-background" : "border-foreground/20 hover:border-foreground/50"
      }`}
    >
      {label}
    </button>
  );
}
