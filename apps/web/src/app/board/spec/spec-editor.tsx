"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { AutoRefresh } from "@/components/auto-refresh";
import { BarButton, BarDivider, BarIcon, BarLink, Segmented } from "@/components/bar";
import { SiteHeader } from "@/components/site-header";
import { generateSpec, regenerateSection, saveSpecEdit } from "@/lib/spec-actions";
import { CITATION_HREF, linkCitations, slug, SPEC_SECTIONS, specHeadings, type SpecSectionKey } from "@/lib/spec";

interface VersionInfo {
  version: number;
  kind: string;
  createdAt: string;
}

export interface CitedRef {
  title: string;
  url: string | null;
  thumb: string | null;
}

interface ClusterInfo {
  id: string;
  name: string;
  status: string;
  size: number;
}

const KIND_LABEL: Record<string, string> = {
  generated: "generated",
  section: "section rewrite",
  edit: "your edit",
  draft: "draft, no AI",
};

const SECTION_TITLE = Object.fromEntries(SPEC_SECTIONS) as Record<SpecSectionKey, string>;

/**
 * A board's design.md: read it with section navigation, cited references as image chips and
 * colour swatches; edit the markdown; generate it, or rewrite one section, from the board.
 */
export function SpecEditor({
  boardId,
  boardName,
  referenceCount,
  markdown: saved,
  version,
  fallbackReason,
  versions,
  clusters,
  refs,
  job,
}: {
  boardId: string;
  boardName: string;
  referenceCount: number;
  markdown: string;
  version: VersionInfo | null;
  fallbackReason: string | null;
  versions: VersionInfo[];
  clusters: ClusterInfo[];
  refs: Record<string, CitedRef>;
  job: { status: string; error: string | null; section: string | null } | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [text, setText] = useState(saved);
  const [message, setMessage] = useState<string | null>(null);
  const [view, setView] = useState<"preview" | "edit" | "split">("preview");
  const reader = useRef<HTMLElement>(null);

  const running = job?.status === "pending" || job?.status === "running";
  const dirty = text !== saved;
  const isLatest = !version || version.version === versions[0]?.version;
  const preview = useMemo(() => withSwatches(linkCitations(text, refs)), [text, refs]);
  const headings = useMemo(() => specHeadings(text), [text]);
  const canRewrite = !pending && !running && !dirty && isLatest && versions.length > 0;
  const rewriteBlocked = dirty
    ? "Save your edits first: the rewrite builds on the saved version"
    : !isLatest
      ? "Open the latest version to rewrite a section"
      : running
        ? "Wait for the current generation to finish"
        : undefined;

  const run = (fn: () => Promise<unknown>, done: string) =>
    start(async () => {
      try {
        setMessage(null);
        await fn();
        setMessage(done);
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  const generate = (clusterIds: string[]) => run(() => generateSpec(boardId, clusterIds), "Queued: the page updates when it's ready.");
  const rewrite = (key: SpecSectionKey) => run(() => regenerateSection(boardId, key), `Rewriting “${SECTION_TITLE[key]}”…`);

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `design-${boardName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  const jump = (id: string) => reader.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const components: Components = {
    h2: ({ children }) => {
      const title = String(Array.isArray(children) ? children.join("") : children);
      const key = SPEC_SECTIONS.find(([, t]) => title.endsWith(t))?.[0];
      return (
        <h2 id={slug(title)} className="group flex items-baseline gap-3">
          <span className="flex-1">{children}</span>
          {key && versions.length > 0 && (
            <button
              type="button"
              onClick={() => rewrite(key)}
              disabled={!canRewrite}
              title={rewriteBlocked ?? `Rewrite “${SECTION_TITLE[key]}” from the board`}
              className="text-xs font-normal text-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 disabled:hidden"
            >
              ↻ Rewrite
            </button>
          )}
        </h2>
      );
    },
    a: ({ href, children, ...props }) => {
      if (href?.startsWith(CITATION_HREF)) {
        const ref = refs[href.slice(CITATION_HREF.length)];
        if (ref) return <Citation cited={ref} />;
      }
      return (
        <a href={href} target="_blank" rel="noreferrer" {...props}>
          {children}
        </a>
      );
    },
    code: ({ children, className }) => {
      const value = typeof children === "string" ? children : "";
      if (!className && HEX.test(value)) {
        return (
          <code className="spec-hex">
            <span aria-hidden className="spec-swatch" style={{ background: value }} />
            {value}
          </code>
        );
      }
      return <code className={className}>{children}</code>;
    },
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {running && <AutoRefresh intervalMs={4000} />}

      <SiteHeader>
        <BarLink href="/board" icon={BarIcon.back}>
          Board
        </BarLink>
        <span className="font-hand text-base">design.md</span>
        {versions.length > 0 && (
          <select
            value={version?.version ?? ""}
            onChange={(e) => router.push(`${pathname}?v=${e.target.value}`)}
            aria-label="Version"
            className="h-8 max-w-56 truncate rounded-lg bg-foreground/[0.06] px-2 font-sans text-xs text-foreground/70 hover:text-foreground"
          >
            {versions.map((s) => (
              <option key={s.version} value={s.version}>
                v{s.version} · {KIND_LABEL[s.kind] ?? s.kind} · {new Date(s.createdAt).toLocaleDateString()}
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex items-center gap-1">
          {versions.length > 0 && (
            <>
              <Segmented
                label="View"
                value={view}
                onChange={setView}
                options={[
                  { value: "preview", label: "Preview" },
                  { value: "split", label: "Split" },
                  { value: "edit", label: "Edit" },
                ]}
              />
              <BarDivider />
              {dirty && (
                <BarButton primary disabled={pending || running} onClick={() => run(() => saveSpecEdit(boardId, text), "Saved as a new version.")}>
                  Save version
                </BarButton>
              )}
              <BarButton
                icon={BarIcon.copy}
                onClick={() => navigator.clipboard.writeText(text).then(() => setMessage("Copied: paste it into your coding agent."))}
              >
                Copy
              </BarButton>
              <BarButton icon={BarIcon.download} onClick={download}>
                Download
              </BarButton>
              <BarDivider />
            </>
          )}
          <GenerateMenu
            label={versions.length ? "Regenerate" : "Generate"}
            clusters={clusters}
            disabled={pending || running || dirty}
            disabledReason={dirty ? "Save or discard your edits first" : undefined}
            onGenerate={generate}
          />
        </div>
      </SiteHeader>

      <Banner
        running={running}
        section={job?.section ?? null}
        referenceCount={referenceCount}
        failed={job?.status === "failed" ? job.error : null}
        fallbackReason={fallbackReason}
        message={message}
        dirty={dirty}
        olderVersion={!isLatest ? version?.version ?? null : null}
        onDiscard={() => setText(saved)}
      />

      {!versions.length && !running ? (
        <EmptyState clusters={clusters} referenceCount={referenceCount} disabled={pending} onGenerate={() => generate([])} />
      ) : (
        <div className="flex min-h-0 flex-1">
          {view !== "edit" && headings.length > 0 && (
            <nav aria-label="Sections" className="hidden w-56 shrink-0 overflow-y-auto border-r border-foreground/10 px-3 py-5 text-sm lg:block">
              <ol className="flex flex-col gap-0.5">
                {headings.map((h, i) => (
                  <li key={h.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => jump(h.id)}
                      className="flex min-w-0 flex-1 gap-1.5 rounded px-2 py-1 text-left font-sans leading-snug text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
                    >
                      <span className="text-foreground/35 tabular-nums">{i + 1}</span>
                      <span>{h.title}</span>
                    </button>
                    {h.key && (
                      <button
                        type="button"
                        onClick={() => rewrite(h.key!)}
                        disabled={!canRewrite}
                        title={rewriteBlocked ?? `Rewrite “${h.title}”`}
                        aria-label={`Rewrite ${h.title}`}
                        className="rounded px-1.5 py-1 text-xs text-foreground/40 opacity-0 group-hover:opacity-100 hover:bg-foreground/5 hover:text-foreground focus-visible:opacity-100 disabled:hidden"
                      >
                        ↻
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <div className={`grid min-h-0 flex-1 ${view === "split" ? "md:grid-cols-2" : "grid-cols-1"}`}>
            {view !== "preview" && (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                readOnly={running}
                spellCheck={false}
                aria-label="design.md source"
                className="min-h-[50vh] resize-none border-foreground/10 bg-transparent p-5 font-mono text-xs leading-relaxed outline-none md:border-r"
              />
            )}
            {view !== "edit" && (
              <article ref={reader} className="prose-spec min-h-0 overflow-y-auto px-6 py-6 text-sm leading-relaxed sm:px-10">
                <div className="mx-auto max-w-3xl">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                    {preview}
                  </ReactMarkdown>
                </div>
              </article>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Bare hex colours (outside code blocks and inline code) become inline code, which gets a swatch. */
function withSwatches(markdown: string) {
  return markdown
    .split(/(```[\s\S]*?```)/g)
    .map((part, i) => (i % 2 ? part : part.replace(/(^|[^`\w#/&])(#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3}))(?![\w`])/g, "$1`$2`")))
    .join("");
}

/** A cited reference: its thumbnail and short id, linking to where it was saved from. */
function Citation({ cited: r }: { cited: CitedRef }) {
  const body = (
    <>
      {r.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
        <img src={r.thumb} alt="" loading="lazy" className="size-4 rounded-[3px] object-cover" />
      ) : (
        <span aria-hidden className="size-4 rounded-[3px] bg-foreground/15" />
      )}
      <span className="max-w-[12rem] truncate">{r.title}</span>
    </>
  );
  const className =
    "spec-cite mx-0.5 inline-flex translate-y-[2px] items-center gap-1 rounded-full border border-foreground/12 bg-foreground/[0.03] py-0.5 pr-2 pl-0.5 align-baseline text-[0.72rem] leading-none no-underline";
  return r.url ? (
    <a href={r.url} target="_blank" rel="noreferrer" title={r.title} className={`${className} hover:border-foreground/35`}>
      {body}
    </a>
  ) : (
    <span title={r.title} className={className}>
      {body}
    </span>
  );
}

function Banner({
  running,
  section,
  referenceCount,
  failed,
  fallbackReason,
  message,
  dirty,
  olderVersion,
  onDiscard,
}: {
  running: boolean;
  section: string | null;
  referenceCount: number;
  failed: string | null;
  fallbackReason: string | null;
  message: string | null;
  dirty: boolean;
  olderVersion: number | null;
  onDiscard: () => void;
}) {
  let body: React.ReactNode = null;
  let tone = "text-foreground/70";
  if (running) {
    const what = section ? `Rewriting “${SECTION_TITLE[section as SpecSectionKey] ?? section}”` : `Writing design.md from ${referenceCount} references`;
    body = (
      <>
        <span aria-hidden className="spec-pulse" />
        {what}… this can take a few minutes on the free AI tier. The page updates when it&apos;s done.
      </>
    );
  } else if (failed) {
    body = `The last generation failed: ${failed}`;
    tone = "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300";
  } else if (message) {
    body = message;
  } else if (dirty) {
    body = (
      <>
        Unsaved edits.{" "}
        <button type="button" onClick={onDiscard} className="underline">
          Discard
        </button>
      </>
    );
  } else if (fallbackReason) {
    body = `This version is a draft built from the analyses without AI, because ${fallbackReason}. Regenerate later for the full write-up.`;
    tone = "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
  } else if (olderVersion) {
    body = `Viewing an older version (v${olderVersion}). Saving an edit makes it the latest.`;
  }
  if (!body) return null;
  return (
    <p role="status" className={`animate-fade flex items-center gap-2 border-b border-foreground/10 px-4 py-2 text-xs ${tone}`}>
      {body}
    </p>
  );
}

function EmptyState({
  clusters,
  referenceCount,
  disabled,
  onGenerate,
}: {
  clusters: ClusterInfo[];
  referenceCount: number;
  disabled: boolean;
  onGenerate: () => void;
}) {
  const used = clusters.filter((c) => c.status === "accepted");
  const shown = used.length ? used : clusters;
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <h1 className="text-2xl">No design.md yet</h1>
        <p className="text-sm text-foreground/60">
          It turns the {referenceCount} references on your board into a spec a coding agent can build from: palette, type, layout,
          components and motion, every value cited to the reference it came from.
        </p>
        {shown.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5">
            {shown.map((c) => (
              <span key={c.id} className="rounded-full border border-foreground/15 px-2.5 py-0.5 text-xs text-foreground/70">
                {c.name} <span className="text-foreground/40">{c.size}</span>
              </span>
            ))}
          </div>
        )}
        <button
          onClick={onGenerate}
          disabled={disabled}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          Generate design.md
        </button>
        <p className="text-xs text-foreground/45">
          {used.length ? "Uses your accepted clusters." : clusters.length ? "Uses the suggested clusters." : "Uses the whole board."} You can
          edit it, rewrite single sections and download it after.
        </p>
      </div>
    </div>
  );
}

/** The generate button, with an optional choice of clusters to focus on. */
function GenerateMenu({
  label,
  clusters,
  disabled,
  disabledReason,
  onGenerate,
}: {
  label: string;
  clusters: ClusterInfo[];
  disabled: boolean;
  disabledReason?: string;
  onGenerate: (clusterIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <BarButton
        primary
        icon={BarIcon.sparkle}
        disabled={disabled}
        title={disabledReason}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <svg viewBox="0 0 10 10" className="size-2.5 opacity-70" fill="currentColor" aria-hidden>
          <path d="M1.5 3.5h7L5 7.5z" />
        </svg>
      </BarButton>
      {open && (
        <div role="dialog" aria-label="Generate design.md" className="animate-fade absolute top-full right-0 z-30 mt-2 w-72 rounded-lg border border-foreground/15 bg-background p-3 text-xs shadow-lg">
          <p className="mb-2 font-sans text-foreground/60">
            {clusters.length
              ? "Accepted clusters are used, or the suggestions if none are accepted. Pick clusters to focus on:"
              : "No clusters yet: the whole board is used."}
          </p>
          <div className="flex max-h-56 flex-col overflow-y-auto">
            {clusters.map((c) => (
              <label key={c.id} className="flex items-center gap-2 rounded px-1 py-1 font-sans hover:bg-foreground/5">
                <input
                  type="checkbox"
                  checked={picked.includes(c.id)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))}
                />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="text-foreground/40">
                  {c.size} · {c.status}
                </span>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onGenerate(picked);
            }}
            className="mt-2 w-full rounded-md bg-foreground px-3 py-1.5 font-medium text-background"
          >
            {picked.length ? `Generate from ${picked.length} cluster${picked.length > 1 ? "s" : ""}` : "Generate"}
          </button>
        </div>
      )}
    </div>
  );
}
