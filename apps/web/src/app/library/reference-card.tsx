import type { CaptureMetadata, Reference } from "@justcreate/shared";

export function ReferenceCard({ reference: r, imageUrl }: { reference: Reference; imageUrl?: string }) {
  const meta = r.metadata as CaptureMetadata;
  const link = r.source_url ?? r.page_url;
  const host = link ? safeHost(link) : null;

  return (
    <article className="overflow-hidden rounded-lg border border-foreground/10 bg-foreground/[0.02]">
      {imageUrl ? (
        <a href={link ?? imageUrl} target="_blank" rel="noreferrer" className="relative block">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs, sizes unknown */}
          <img src={imageUrl} alt={r.title ?? ""} loading="lazy" className="block h-auto w-full" />
          {r.type === "video" && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-black/60 px-3 py-2 text-white">▶</span>
            </span>
          )}
        </a>
      ) : (
        r.type === "tweet" && meta.text && <p className="whitespace-pre-line p-3 text-sm">{meta.text}</p>
      )}
      <div className="flex flex-col gap-1 p-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded bg-foreground/10 px-1.5 py-0.5 uppercase tracking-wide">{r.type}</span>
          <time className="text-foreground/50" dateTime={r.created_at}>
            {new Date(r.created_at).toLocaleDateString()}
          </time>
        </div>
        {r.title && <p className="line-clamp-2 font-medium">{r.title}</p>}
        {r.type === "tweet" && meta.author && (
          <p className="text-foreground/60">
            {meta.author} {meta.handle}
          </p>
        )}
        {r.type === "video" && meta.channel && <p className="text-foreground/60">{meta.channel}</p>}
        {r.note && <p className="italic text-foreground/70">{r.note}</p>}
        {link && host && (
          <a href={link} target="_blank" rel="noreferrer" className="truncate text-foreground/50 hover:underline">
            {host}
          </a>
        )}
      </div>
    </article>
  );
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
