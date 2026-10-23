"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AutoRefresh } from "@/components/auto-refresh";
import { generateSpec, regenerateSection, saveSpecEdit } from "@/lib/spec-actions";
import { linkCitations, SPEC_SECTIONS } from "@/lib/spec";

interface VersionInfo {
  version: number;
  kind: string;
  createdAt: string;
}

const KIND_LABEL: Record<string, string> = {
  generated: "generated",
  section: "section rewrite",
  edit: "your edit",
  draft: "draft (no AI)",
};

/** Split markdown editor + live preview for a board's design.md, with versions and generation. */
export function SpecEditor({
  boardId,
  boardName,
  markdown: saved,
  version,
  versions,
  clusters,
  refs,
  job,
}: {
  boardId: string;
  boardName: string;
  markdown: string;
  version: VersionInfo | null;
  versions: VersionInfo[];
  clusters: { id: string; name: string; status: string }[];
  refs: Record<string, { title: string; url: string | null }>;
  job: { status: string; error: string | null; section: string | null } | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [text, setText] = useState(saved);
  const [picked, setPicked] = useState<string[]>([]);
  const [section, setSection] = useState<string>(SPEC_SECTIONS[1][0]);
  const [message, setMessage] = useState<string | null>(null);
  const [view, setView] = useState<"split" | "edit" | "preview">("split");

  const running = job?.status === "pending" || job?.status === "running";
  const dirty = text !== saved;
  const isLatest = !version || version.version === versions[0]?.version;
  const preview = useMemo(() => linkCitations(text, refs), [text, refs]);

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

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `design-${boardName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {running && <AutoRefresh intervalMs={3000} />}

      <div className="flex flex-wrap items-center gap-2 border-b border-foreground/10 px-4 py-2 text-xs">
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-md bg-foreground px-3 py-1.5 font-medium text-background">
            {versions.length ? "Regenerate all…" : "Generate design.md…"}
          </summary>
          <div className="absolute left-0 z-20 mt-1 w-72 rounded-md border border-foreground/15 bg-background p-3 shadow-lg">
            <p className="mb-2 text-foreground/60">
              Uses accepted clusters by default (or the whole board). Pick clusters to focus the spec:
            </p>
            {clusters.length === 0 && <p className="mb-2 text-foreground/50">No clusters yet: the whole board is used.</p>}
            {clusters.map((c) => (
              <label key={c.id} className="flex items-center gap-2 py-0.5">
                <input
                  type="checkbox"
                  checked={picked.includes(c.id)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))}
                />
                <span className="truncate">{c.name}</span>
                <span className="ml-auto text-foreground/40">{c.status}</span>
              </label>
            ))}
            <button
              disabled={pending || running || dirty}
              onClick={() => run(() => generateSpec(boardId, picked), "Generation queued — this takes a minute.")}
              className="mt-2 w-full rounded-md bg-foreground px-3 py-1.5 font-medium text-background disabled:opacity-50"
            >
              Generate
            </button>
          </div>
        </details>

        <select
          value={section}
          onChange={(e) => setSection(e.target.value)}
          aria-label="Section to regenerate"
          className="rounded-md border border-foreground/20 bg-transparent px-2 py-1.5"
        >
          {SPEC_SECTIONS.map(([key, title]) => (
            <option key={key} value={key}>
              {title}
            </option>
          ))}
        </select>
        <button
          disabled={pending || running || dirty || !versions.length}
          onClick={() => run(() => regenerateSection(boardId, section), "Section rewrite queued.")}
          className="rounded-md border border-foreground/20 px-2 py-1.5 disabled:opacity-50"
          title={dirty ? "Save your edits first: the rewrite builds on the saved version" : undefined}
        >
          Regenerate section
        </button>

        <span className="mx-1 h-4 w-px bg-foreground/15" />
        <button
          disabled={pending || !dirty || running}
          onClick={() => run(() => saveSpecEdit(boardId, text), "Saved as a new version.")}
          className="rounded-md border border-foreground/20 px-2 py-1.5 disabled:opacity-50"
        >
          Save version
        </button>
        <button disabled={!text} onClick={download} className="rounded-md border border-foreground/20 px-2 py-1.5 disabled:opacity-50">
          Download .md
        </button>
        <button
          disabled={!text}
          onClick={() => navigator.clipboard.writeText(text).then(() => setMessage("Copied to clipboard."))}
          className="rounded-md border border-foreground/20 px-2 py-1.5 disabled:opacity-50"
        >
          Copy
        </button>

        <div className="ml-auto flex items-center gap-2">
          {versions.length > 0 && (
            <select
              value={version?.version ?? ""}
              onChange={(e) => router.push(`${pathname}?v=${e.target.value}`)}
              aria-label="Version"
              className="rounded-md border border-foreground/20 bg-transparent px-2 py-1.5"
            >
              {versions.map((s) => (
                <option key={s.version} value={s.version}>
                  v{s.version} · {KIND_LABEL[s.kind] ?? s.kind} · {new Date(s.createdAt).toLocaleString()}
                </option>
              ))}
            </select>
          )}
          <div role="tablist" className="flex overflow-hidden rounded-md border border-foreground/20">
            {(["edit", "split", "preview"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`px-2 py-1.5 capitalize ${view === v ? "bg-foreground text-background" : ""}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {(running || message || (job?.status === "failed" && job.error) || !isLatest || dirty) && (
        <p role="status" className="border-b border-foreground/10 px-4 py-1.5 text-xs text-foreground/70">
          {running
            ? `Generating${job?.section ? ` “${SPEC_SECTIONS.find(([k]) => k === job.section)?.[1]}”` : ""}… the page updates when it's done.`
            : job?.status === "failed" && job.error
              ? `Last generation failed: ${job.error}`
              : message ?? (dirty ? "Unsaved edits." : `Viewing an older version (v${version?.version}). Saving creates a new version.`)}
        </p>
      )}

      {!versions.length && !running ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-foreground/60">
          <p>No design.md yet for this board.</p>
          <p>Generate one from its analysed references and clusters, then edit, regenerate sections and download.</p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
          {view !== "preview" && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              readOnly={running}
              spellCheck={false}
              aria-label="design.md source"
              className={`min-h-[50vh] resize-none border-foreground/10 bg-transparent p-4 font-mono text-xs leading-relaxed outline-none md:border-r ${
                view === "edit" ? "md:col-span-2" : ""
              }`}
            />
          )}
          {view !== "edit" && (
            <article
              className={`prose-spec min-h-0 overflow-y-auto p-6 text-sm leading-relaxed ${view === "preview" ? "md:col-span-2" : ""}`}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer" /> }}>
                {preview}
              </ReactMarkdown>
            </article>
          )}
        </div>
      )}
    </div>
  );
}
