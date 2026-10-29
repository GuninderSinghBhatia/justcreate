"use client";

import type { CaptureMetadata } from "@justcreate/shared";
import type { ReferenceView } from "@/lib/references";

/** One saved item in a grid. Styling varies by type: video gets a play badge, posts show text. */
export function ReferenceCard({
  reference: r,
  onOpen,
  selected,
}: {
  reference: ReferenceView;
  onOpen?: (r: ReferenceView) => void;
  selected?: boolean;
}) {
  const meta = r.metadata as CaptureMetadata;
  const host = safeHost(r.source_url ?? r.page_url);

  return (
    <article
      className={`group overflow-hidden rounded-lg border bg-foreground/[0.02] transition-colors ${
        selected ? "border-foreground" : "border-foreground/10 hover:border-foreground/30"
      }`}
    >
      <button type="button" onClick={() => onOpen?.(r)} className="block w-full text-left font-sans">
        {r.imageUrl ? (
          <span className="relative block">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs, sizes unknown */}
            <img src={r.imageUrl} alt={r.title ?? ""} loading="lazy" className="block h-auto w-full" />
            {r.type === "video" && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-black/60 px-3 py-2 text-white">▶</span>
              </span>
            )}
          </span>
        ) : (
          r.type === "tweet" &&
          meta.text && <p className="line-clamp-6 whitespace-pre-line p-3 text-sm">{meta.text}</p>
        )}
        <span className="flex flex-col gap-1 p-3 text-xs">
          <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="rounded bg-foreground/10 px-1.5 py-0.5 uppercase tracking-wide">{r.type}</span>
            <time className="text-foreground/50" dateTime={r.created_at}>
              {new Date(r.created_at).toLocaleDateString()}
            </time>
          </span>
          {r.title && <span className="line-clamp-2 font-medium">{r.title}</span>}
          {r.type === "tweet" && meta.author && (
            <span className="text-foreground/60">
              {meta.author} {meta.handle}
            </span>
          )}
          {r.type === "video" && meta.channel && <span className="text-foreground/60">{meta.channel}</span>}
          {r.note && <span className="line-clamp-2 italic text-foreground/70">{r.note}</span>}
          {(r.labels.length > 0 || (r.analysis?.tags.length ?? 0) > 0) && (
            <span className="flex flex-wrap gap-1">
              {r.labels.map((l) => (
                <span key={l} className="rounded-full sketch border-foreground/80 px-1.5">
                  {l}
                </span>
              ))}
              {r.analysis?.tags.slice(0, 3).map((t) => (
                <span key={`ai-${t}`} className="rounded-full bg-foreground/5 px-1.5 text-foreground/60">
                  {t}
                </span>
              ))}
            </span>
          )}
          {host && <span className="truncate text-foreground/50">{host}</span>}
        </span>
      </button>
    </article>
  );
}

export function safeHost(url: string | null | undefined) {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
