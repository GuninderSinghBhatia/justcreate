"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PRINTS, Shot, type PrintId } from "./prints";
import { Piece, Stage, type Thread } from "./stage";

const CTA = "Start your board";

export function LandingBoard() {
  return (
    <div className="lp min-h-dvh overflow-x-clip">
      <a href="#top" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--lp-ink)] focus:px-3 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <Tools />
      <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-8 min-[1100px]:pl-28">
        <header className="flex items-center justify-between pt-6">
          <Link href="#top" className="relative px-3 py-1 text-lg font-extrabold tracking-tight">
            <span aria-hidden className="absolute inset-0 -rotate-2 bg-[var(--lp-butter)] opacity-90 shadow-sm" />
            <span className="relative">JustCreate</span>
          </Link>
          <Link href="/login" className="lp-link text-base">
            Sign in
          </Link>
        </header>
        <main id="top">
          <Hero />
          <Capture />
          <Board />
          <Clusters />
          <Spec />
          <Agent />
          <Questions />
          <Close />
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t-[1.5px] border-[rgb(21_21_21/0.15)] py-8 text-sm font-semibold text-[var(--lp-ink-soft)]">
          <span>JustCreate · the references on this page are made-up examples</span>
          <nav aria-label="Legal" className="flex gap-6">
            <Link href="/privacy" className="hover:text-[var(--lp-red)]">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[var(--lp-red)]">
              Terms
            </Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function Print({ id, hold = "pin", tape, cited = false, i = 0 }: { id: PrintId; hold?: "pin" | "tape" | "none"; tape?: string; cited?: boolean; i?: number }) {
  const p = PRINTS[id];
  return (
    <figure className={`lp-print lp-drop relative ${cited ? "is-cited" : ""}`} style={{ "--i": i } as React.CSSProperties}>
      {hold === "pin" && <span className="lp-pin" data-pin aria-hidden />}
      {hold === "tape" && <span className="lp-tape" data-pin aria-hidden style={tape ? ({ "--tape": tape } as React.CSSProperties) : undefined} />}
      <div className="lp-shot" style={{ "--ar": p.ar } as React.CSSProperties} role="img" aria-label={`Example reference: ${p.title.toLowerCase()}`}>
        <Shot id={id} />
      </div>
      <figcaption>
        <span>{p.title}</span>
        <span>{p.kind}</span>
      </figcaption>
    </figure>
  );
}

function Sticky({ tone, children, className = "", i = 0 }: { tone: string; children: React.ReactNode; className?: string; i?: number }) {
  return (
    <div className={`lp-sticky lp-drop ${className}`} style={{ "--tone": tone, "--i": i } as React.CSSProperties}>
      {children}
    </div>
  );
}

function Ink({ children, red, className = "" }: { children: React.ReactNode; red?: boolean; className?: string }) {
  return <p className={`lp-ink ${red ? "lp-ink--red" : ""} ${className}`}>{children}</p>;
}

/** A drawn arrow in ink, for notes that point at things. */
function Arrow({ d, className = "", red }: { d: string; className?: string; red?: boolean }) {
  return (
    <svg viewBox="0 0 120 80" className={className} aria-hidden fill="none" stroke={red ? "var(--lp-red)" : "var(--lp-blue)"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function StartTag() {
  return (
    <Link href="/login" className="lp-tag">
      {CTA}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
}

/* ------------------------------------------------------------------ tool strip */

const TOOLS = [
  { href: "#top", label: "Top", icon: "M4 12 12 4l8 8M6 10v10h12V10" },
  { href: "#capture", label: "Capture", icon: "M5 3l13 8-6 1.5L9 19z" },
  { href: "#board", label: "Board", icon: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" },
  { href: "#clusters", label: "Clusters", icon: "M6 6a2 2 0 1 0 0 .1M18 7a2 2 0 1 0 0 .1M12 18a2 2 0 1 0 0 .1M7.5 7.5 11 16.5M16.6 8.6 13 16.4M8 6.4 16 6.8" },
  { href: "#spec", label: "design.md", icon: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h4" },
  { href: "#agent", label: "Your agent", icon: "M4 6h16v12H4zM8 10l3 2-3 2M13 14h3" },
  { href: "#questions", label: "Questions", icon: "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.5v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18" },
];

function Tools() {
  const [current, setCurrent] = useState("#top");
  useEffect(() => {
    const sections = TOOLS.map((t) => document.querySelector(t.href)).filter((s): s is Element => !!s);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(`#${e.target.id}`);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);
  return (
    <nav className="lp-tools" aria-label="Page sections">
      {TOOLS.map((t, i) => (
        <span key={t.href} className="contents">
          {i === 1 && <hr />}
          <a href={t.href} aria-current={current === t.href ? "true" : undefined}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={t.icon} />
            </svg>
            <span className="lp-tip">{t.label}</span>
          </a>
        </span>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ 1. hero */

const HERO_THREADS: Thread[] = [
  { from: "h-cluster", to: "h-nightline" },
  { from: "h-cluster", to: "h-pulse" },
  { from: "h-cluster", to: "h-signal" },
];

function Hero() {
  return (
    <Stage threads={HERO_THREADS} className="pb-16 pt-14 min-[900px]:min-h-[min(760px,calc(100dvh-60px))] min-[900px]:pb-24" label="JustCreate">
      <div className="relative z-[4] flex flex-col gap-7 min-[900px]:max-w-[50%]">
        <h1 className="lp-display">Turn the designs you save into a spec your agent can build</h1>
        <p className="lp-lede">
          Right click anything you love on the web. JustCreate groups it into style clusters and writes a design.md with real hex codes, type and
          spacing, every line cited to the reference it came from.
        </p>
        <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
          <StartTag />
          <a href="#capture" className="lp-link">
            See it work
          </a>
        </div>
        <Ink className="-rotate-2 text-lg">Free during early access. No card.</Ink>
      </div>

      <div className="relative mt-10 h-[470px] min-[900px]:absolute min-[900px]:inset-y-0 min-[900px]:right-0 min-[900px]:mt-0 min-[900px]:h-auto min-[900px]:w-[50%]">
        <Piece node="h-nightline" x="4%" y="13%" w="52%" r={-3} mx="0%" my="2%" mw="62%" drag>
          <Print id="nightline" i={0} />
        </Piece>
        <Piece node="h-pulse" x="66%" y="4%" w="28%" r={4} mx="66%" my="0%" mw="33%" drag>
          <Print id="pulse" i={1} />
        </Piece>
        <Piece node="h-signal" x="64%" y="55%" w="24%" r={-5} mx="64%" my="52%" mw="32%" drag>
          <Print id="signal" i={2} />
        </Piece>
        <Piece node="h-cluster" x="10%" y="64%" w="38%" r={-1.5} mx="2%" my="64%" mw="56%">
          <Sticky tone="var(--lp-lilac)" i={3}>
            <h3>Night shift dashboards</h3>
            <p className="mt-1">3 references · dark ground, neon pink and cyan, dense stat tiles</p>
          </Sticky>
        </Piece>
        <Piece x="37%" y="-3%" w="30%" r={-4} className="hidden min-[900px]:block">
          <Ink>right click → saved, with its source link</Ink>
          <Arrow d="M8 20 C40 10 70 18 100 46 M88 44l13 3 2-13" className="ml-14 mt-1 w-24" />
        </Piece>
      </div>
    </Stage>
  );
}

/* ------------------------------------------------------------------ 2. capture */

function Capture() {
  return (
    <Stage
      id="capture"
      threads={[{ from: "c-menu", to: "c-saved" }]}
      className="scroll-mt-8 border-t-[1.5px] border-dashed border-[rgb(21_21_21/0.2)] py-20 min-[900px]:py-28"
      label="Capture"
    >
      <div className="flex flex-col gap-5 min-[900px]:max-w-[46%]">
        <h2 className="lp-heading">Save anything with one right click</h2>
        <p className="lp-lede">
          Images, a region you drag, the visible area or the full page, YouTube videos at their timestamp, X posts with their text, whole pages
          with their title and preview. The source link always comes along.
        </p>
      </div>

      <div className="relative mt-12 h-[640px] min-[900px]:h-[560px]">
        <Piece x="0%" y="2%" w="58%" mx="0%" my="0%" mw="100%">
          <Browser />
        </Piece>
        <Piece node="c-saved" x="75%" y="44%" w="19%" r={5} mx="58%" my="62%" mw="38%" drag>
          <Print id="ledger" hold="tape" i={1} />
        </Piece>
        <Piece x="66%" y="0%" w="30%" r={2} mx="0%" my="66%" mw="54%">
          <Sticky tone="var(--lp-butter)" i={2}>
            <h3>Keyboard too</h3>
            <p className="mt-2">
              <Kbd>Alt</Kbd> <Kbd>Shift</Kbd> <Kbd>S</Kbd> saves the page.
              <br />
              <Kbd>Alt</Kbd> <Kbd>Shift</Kbd> <Kbd>R</Kbd> grabs a region.
            </p>
          </Sticky>
        </Piece>
        <Piece x="58%" y="82%" w="34%" r={-2} mx="2%" my="91%" mw="70%">
          <Ink>offline? it waits and retries every minute</Ink>
        </Piece>
      </div>
    </Stage>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-[5px] border-[1.5px] border-b-[3px] border-[rgb(21_21_21/0.5)] bg-white/70 px-1.5 py-px font-sans text-[0.8rem] font-extrabold">{children}</kbd>;
}

/** A browser window with the extension's real image menu open over a picture. */
function Browser() {
  return (
    <div className="lp-drop overflow-hidden rounded-[10px] bg-[#fbfbf8] shadow-[var(--lp-shadow)]">
      <div className="flex items-center gap-2 border-b border-[rgb(21_21_21/0.1)] bg-[#efefeb] px-3 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          {["#e0675a", "#e6b84a", "#6cc073"].map((c) => (
            <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
          ))}
        </span>
        <span className="ml-2 flex-1 truncate rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#6b6b66]">a page you like</span>
      </div>
      <div className="relative grid grid-cols-[1fr_1.1fr] gap-5 p-5">
        <div className="flex flex-col gap-2.5 pt-2" aria-hidden>
          <span className="h-4 w-4/5 rounded bg-[rgb(21_21_21/0.75)]" />
          <span className="h-4 w-3/5 rounded bg-[rgb(21_21_21/0.75)]" />
          {[92, 86, 90, 70].map((w) => (
            <span key={w} className="h-2 rounded bg-[rgb(21_21_21/0.15)]" style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="relative aspect-[4/5] overflow-hidden rounded-md" style={{ containerType: "inline-size" }} role="img" aria-label="Example picture on the page">
          <Shot id="ledger" />
        </div>
        <ContextMenu />
      </div>
    </div>
  );
}

function ContextMenu() {
  return (
    <div className="absolute left-[44%] top-[34%] z-[5] w-[min(300px,62%)] min-w-[230px] rounded-lg bg-white py-1.5 text-[13px] font-semibold shadow-[0_2px_4px_rgb(0_0_0/0.12),0_16px_32px_-12px_rgb(0_0_0/0.45)]" aria-hidden>
      {["Open image in new tab", "Save image as…", "Copy image"].map((t) => (
        <div key={t} className="px-4 py-1.5 text-[#3d3d3a]">
          {t}
        </div>
      ))}
      <div className="my-1 h-px bg-[rgb(21_21_21/0.1)]" />
      <div data-node="c-menu" className="relative mx-1.5 flex items-center gap-2 rounded-md bg-[var(--lp-lilac)] px-2.5 py-1.5 text-[var(--lp-ink)]">
        <span className="grid h-4 w-4 place-items-center rounded-[4px] bg-[var(--lp-ink)] text-[9px] font-extrabold text-white">J</span>
        Save image to JustCreate
        <span data-pin data-anchor="right" className="absolute right-1 top-1/2 h-1 w-1" />
      </div>
      <div className="flex items-center gap-2 px-4 py-1.5 text-[#3d3d3a]">
        <span className="h-4 w-4" />
        Screenshot a region…
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 3. board */

const BOARD: { id: PrintId; x: string; y: string; w: string; r: number; mx: string; my: string; mw: string; hold?: "pin" | "tape"; tape?: string }[] = [
  { id: "poster", x: "0%", y: "6%", w: "17%", r: -4, mx: "0%", my: "0%", mw: "40%" },
  { id: "kiln", x: "19%", y: "0%", w: "25%", r: 2, mx: "44%", my: "2%", mw: "54%", hold: "tape" },
  { id: "folio", x: "47%", y: "8%", w: "22%", r: -2, mx: "4%", my: "26%", mw: "50%" },
  { id: "zine", x: "72%", y: "0%", w: "16%", r: 5, mx: "60%", my: "24%", mw: "36%", hold: "tape", tape: "rgb(246 205 176 / 0.85)" },
  { id: "nightline", x: "6%", y: "52%", w: "30%", r: 1.5, mx: "0%", my: "50%", mw: "60%" },
  { id: "transit", x: "39%", y: "56%", w: "14%", r: -6, mx: "64%", my: "48%", mw: "33%" },
  { id: "ledger", x: "56%", y: "48%", w: "14%", r: 3, mx: "6%", my: "74%", mw: "30%", hold: "tape", tape: "rgb(205 230 210 / 0.9)" },
  { id: "pulse", x: "73%", y: "50%", w: "14%", r: -3, mx: "40%", my: "72%", mw: "28%" },
  { id: "signal", x: "89%", y: "30%", w: "11%", r: 6, mx: "72%", my: "76%", mw: "26%" },
];

function Board() {
  return (
    <Stage id="board" className="scroll-mt-8 border-t-[1.5px] border-dashed border-[rgb(21_21_21/0.2)] py-20 min-[900px]:py-28" label="Board">
      <div className="flex flex-col gap-5 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
        <h2 className="lp-heading min-[900px]:max-w-[52%]">Everything lands on one private board</h2>
        <p className="lp-lede min-[900px]:max-w-[38%]">
          A full canvas: drag, resize, frame and scribble. Only you can see it. Drop or paste images straight in too.
        </p>
      </div>
      <div className="relative mt-14 h-[760px] min-[900px]:h-[560px]">
        {BOARD.map((b, i) => (
          <Piece key={b.id} x={b.x} y={b.y} w={b.w} r={b.r} mx={b.mx} my={b.my} mw={b.mw} drag>
            <Print id={b.id} hold={b.hold ?? "pin"} tape={b.tape} i={i} />
          </Piece>
        ))}
        <Piece x="56%" y="90%" w="30%" r={-3} className="hidden min-[900px]:block">
          <Ink>go on, drag one around</Ink>
        </Piece>
      </div>
    </Stage>
  );
}

/* ------------------------------------------------------------------ 4. clusters */

type Status = "suggested" | "accepted" | "rejected";

const CLUSTERS = [
  {
    key: "dark",
    name: "Night shift dashboards",
    note: "dark ground, neon pink and cyan, dense tiles",
    tone: "var(--lp-lilac)",
    members: ["nightline", "pulse", "signal"] as PrintId[],
  },
  { key: "warm", name: "Warm editorial", note: "oat and peach paper, serif heads, brick accents", tone: "var(--lp-peach)", members: ["kiln", "zine"] as PrintId[] },
  { key: "swiss", name: "Swiss grid", note: "heavy grotesk, strict columns, one signal colour", tone: "var(--lp-mint)", members: ["poster", "folio", "transit"] as PrintId[] },
];

const CLUSTER_LAYOUT: Partial<Record<PrintId, { x: string; y: string; w: string; r: number; mx: string; my: string; mw: string }>> = {
  nightline: { x: "0%", y: "0%", w: "22%", r: -2, mx: "0%", my: "0%", mw: "52%" },
  pulse: { x: "4%", y: "48%", w: "11%", r: 3, mx: "56%", my: "2%", mw: "26%" },
  signal: { x: "17%", y: "52%", w: "10%", r: -4, mx: "80%", my: "6%", mw: "20%" },
  kiln: { x: "37%", y: "4%", w: "19%", r: 2, mx: "0%", my: "36%", mw: "48%" },
  zine: { x: "41%", y: "50%", w: "12%", r: -3, mx: "54%", my: "36%", mw: "28%" },
  poster: { x: "68%", y: "0%", w: "12%", r: 3, mx: "0%", my: "70%", mw: "28%" },
  folio: { x: "82%", y: "6%", w: "18%", r: -2, mx: "32%", my: "70%", mw: "40%" },
  transit: { x: "86%", y: "52%", w: "11%", r: 5, mx: "76%", my: "72%", mw: "24%" },
};

const STICKY_LAYOUT = [
  { x: "1%", y: "84%", w: "27%", mx: "0%", my: "22%", mw: "100%" },
  { x: "35%", y: "84%", w: "26%", mx: "0%", my: "56%", mw: "100%" },
  { x: "68%", y: "84%", w: "29%", mx: "0%", my: "92%", mw: "100%" },
];

function Clusters() {
  const [state, setState] = useState<Record<string, { status: Status; name: string; editing: boolean }>>(() =>
    Object.fromEntries(CLUSTERS.map((c) => [c.key, { status: "suggested" as Status, name: c.name, editing: false }])),
  );
  const set = (key: string, patch: Partial<{ status: Status; name: string; editing: boolean }>) =>
    setState((s) => ({ ...s, [key]: { ...s[key], ...patch } }));

  const threads = useMemo<Thread[]>(
    () => CLUSTERS.flatMap((c) => c.members.map((m) => ({ from: `k-${c.key}`, to: `k-${m}`, off: state[c.key].status === "rejected" }))),
    [state],
  );

  return (
    <Stage id="clusters" threads={threads} className="scroll-mt-8 border-t-[1.5px] border-dashed border-[rgb(21_21_21/0.2)] py-20 min-[900px]:py-28" label="Clusters">
      <div className="flex flex-col gap-5 min-[900px]:max-w-[60%]">
        <h2 className="lp-heading">AI groups them by look. You decide.</h2>
        <p className="lp-lede">
          References are grouped by palette, layout, type and effects, and each group gets a name. Accept, rename or reject it: your call sticks.
          Try it below.
        </p>
      </div>
      <div className="relative mt-14 h-[1180px] min-[900px]:h-[600px]">
        {CLUSTERS.flatMap((c) =>
          c.members.map((m, i) => {
            const l = CLUSTER_LAYOUT[m]!;
            return (
              <Piece key={m} node={`k-${m}`} x={l.x} y={l.y} w={l.w} r={l.r} mx={l.mx} my={l.my} mw={l.mw} drag>
                <div className={`transition-opacity duration-500 ${state[c.key].status === "rejected" ? "opacity-45" : ""}`}>
                  <Print id={m} i={i} />
                </div>
              </Piece>
            );
          }),
        )}
        {CLUSTERS.map((c, i) => {
          const s = state[c.key];
          const l = STICKY_LAYOUT[i];
          return (
            <Piece key={c.key} node={`k-${c.key}`} x={l.x} y={l.y} w={l.w} r={i === 1 ? 1 : -1} mx={l.mx} my={l.my} mw={l.mw}>
              <ClusterSticky c={c} s={s} i={i} set={set} />
            </Piece>
          );
        })}
      </div>
    </Stage>
  );
}

function ClusterSticky({
  c,
  s,
  i,
  set,
}: {
  c: (typeof CLUSTERS)[number];
  s: { status: Status; name: string; editing: boolean };
  i: number;
  set: (key: string, patch: Partial<{ status: Status; name: string; editing: boolean }>) => void;
}) {
  return (
    <Sticky tone={c.tone} i={i + 6} className={s.status === "rejected" ? "opacity-60" : ""}>
      {s.status === "accepted" && <span className="lp-stamp">Accepted</span>}
      {s.status === "rejected" && <span className="lp-stamp !border-[#6b6b66] !text-[#6b6b66]">Rejected</span>}
      {s.editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            set(c.key, { editing: false });
          }}
        >
          <label className="sr-only" htmlFor={`name-${c.key}`}>
            Cluster name
          </label>
          <input
            id={`name-${c.key}`}
            autoFocus
            value={s.name}
            maxLength={40}
            onChange={(e) => set(c.key, { name: e.target.value })}
            onBlur={() => set(c.key, { editing: false })}
            className="w-full rounded-md border-[1.5px] border-[var(--lp-ink)] bg-white/70 px-2 py-1 text-[1.05rem] font-extrabold outline-none"
          />
        </form>
      ) : (
        <h3>{s.name || "Untitled cluster"}</h3>
      )}
      <p className="mt-1">
        {c.members.length} references · {c.note}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="lp-chip" aria-pressed={s.status === "accepted"} onClick={() => set(c.key, { status: s.status === "accepted" ? "suggested" : "accepted" })}>
          Accept
        </button>
        <button type="button" className="lp-chip" onClick={() => set(c.key, { editing: true })}>
          Rename
        </button>
        <button type="button" className="lp-chip" aria-pressed={s.status === "rejected"} onClick={() => set(c.key, { status: s.status === "rejected" ? "suggested" : "rejected" })}>
          Reject
        </button>
      </div>
    </Sticky>
  );
}

/* ------------------------------------------------------------------ 5. design.md */

const SPEC: ({ h: string } | { swatch?: string; text: string; kind: "Observed" | "Inferred"; cite: PrintId })[] = [
  { h: "## 2. Colour palette" },
  { swatch: "#0F0F1A", text: "#0F0F1A  Background", kind: "Observed", cite: "nightline" },
  { swatch: "#FF2D9A", text: "#FF2D9A  Accent", kind: "Observed", cite: "pulse" },
  { swatch: "#00E5FF", text: "#00E5FF  Data highlight", kind: "Observed", cite: "signal" },
  { swatch: "#2E283D", text: "#2E283D  Surface", kind: "Observed", cite: "nightline" },
  { h: "## 3. Typography" },
  { text: "Display: geometric sans, 650, tracking −2%", kind: "Inferred", cite: "nightline" },
  { h: "## 4. Layout" },
  { text: "Sidebar at 20% width, three stat tiles in a row", kind: "Observed", cite: "nightline" },
  { h: "## 5. Components" },
  { text: "Status pills: full radius, filled when live", kind: "Observed", cite: "pulse" },
];

function Spec() {
  const [active, setActive] = useState(1);
  const line = SPEC[active];
  const cited = "cite" in line ? line.cite : null;
  const threads = useMemo<Thread[]>(
    () =>
      SPEC.flatMap((l, i) => ("cite" in l ? [{ from: `s-line-${i}`, to: `s-${l.cite}`, tone: "cite" as const, on: i === active }] : [])),
    [active],
  );
  return (
    <Stage id="spec" threads={threads} className="scroll-mt-8 border-t-[1.5px] border-dashed border-[rgb(21_21_21/0.2)] py-20 min-[900px]:py-28" label="design.md">
      <div className="flex flex-col gap-5 min-[900px]:max-w-[60%]">
        <h2 className="lp-heading">A design.md where every line shows its source</h2>
        <p className="lp-lede">
          Palettes are measured from pixels. Each claim says whether it was observed in the image or inferred, and cites the reference it came
          from. Point at a line.
        </p>
      </div>
      <div className="relative mt-14 h-[1060px] min-[900px]:h-[600px]">
        <Piece x="0%" y="0%" w="58%" mx="0%" my="0%" mw="100%">
          <div className="lp-sheet lp-drop">
            <span className="lp-tape" style={{ "--tr": "2deg" } as React.CSSProperties} aria-hidden />
            <p className="text-[#8a8a84]"># design.md — Night shift dashboards</p>
            <ul className="mt-2">
              {SPEC.map((l, i) =>
                "h" in l ? (
                  <li key={l.h} className="mt-4 font-bold">
                    {l.h}
                  </li>
                ) : (
                  <li key={l.text}>
                    <button
                      type="button"
                      className={`lp-line ${i === active ? "is-on" : ""}`}
                      aria-pressed={i === active}
                      onMouseEnter={() => setActive(i)}
                      onFocus={() => setActive(i)}
                      onClick={() => setActive(i)}
                    >
                      {l.swatch ? (
                        <span className="h-3.5 w-3.5 rounded-[3px] border border-[rgb(21_21_21/0.3)]" style={{ background: l.swatch }} aria-hidden />
                      ) : (
                        <span className="w-3.5" aria-hidden />
                      )}
                      <span>{l.text}</span>
                      <span className="flex items-center gap-2">
                        <span className="lp-kind">{l.kind}</span>
                        <span className="lp-ref" data-node={`s-line-${i}`} data-anchor="right">
                          ref:{PRINTS[l.cite].ref}
                        </span>
                      </span>
                    </button>
                  </li>
                ),
              )}
            </ul>
          </div>
        </Piece>
        {(["nightline", "pulse", "signal"] as PrintId[]).map((id, i) => {
          const pos = [
            { x: "68%", y: "2%", w: "30%", r: 2, mx: "0%", my: "70%", mw: "56%" },
            { x: "72%", y: "42%", w: "15%", r: -3, mx: "60%", my: "70%", mw: "36%" },
            { x: "88%", y: "50%", w: "12%", r: 4, mx: "62%", my: "90%", mw: "30%" },
          ][i];
          return (
            <Piece key={id} node={`s-${id}`} {...pos} drag>
              <Print id={id} cited={cited === id} i={i + 1} />
            </Piece>
          );
        })}
      </div>
    </Stage>
  );
}

/* ------------------------------------------------------------------ 6. agent */

function Agent() {
  return (
    <Stage
      id="agent"
      threads={[
        { from: "a-file", to: "a-claude" },
        { from: "a-file", to: "a-cursor" },
      ]}
      className="scroll-mt-8 border-t-[1.5px] border-dashed border-[rgb(21_21_21/0.2)] py-20 min-[900px]:py-28"
      label="Your agent"
    >
      <div className="grid gap-12 min-[900px]:grid-cols-[1fr_1.1fr] min-[900px]:items-center">
        <div className="flex flex-col gap-5">
          <h2 className="lp-heading">Then hand it to your coding agent</h2>
          <p className="lp-lede">
            Download design.md, or connect Claude Code and Cursor over MCP with a read-only token: they fetch the latest spec and its
            references themselves. Rewrite one section without touching the rest.
          </p>
        </div>
        <div className="relative h-[420px]">
          <Piece node="a-file" x="2%" y="14%" w="40%" r={-3} mx="0%" my="6%" mw="52%">
            <div className="lp-drop relative [filter:drop-shadow(0_1px_1px_rgb(30_30_25/0.16))_drop-shadow(0_10px_12px_rgb(30_30_25/0.22))]">
              <span data-pin className="absolute left-1/2 top-2 z-10 h-1 w-1" aria-hidden />
              <div className="bg-[#fffffd] p-5 pb-6 [clip-path:polygon(0_0,82%_0,100%_18%,100%_100%,0_100%)]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--lp-ink)" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
                <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h4" />
              </svg>
              <p className="mt-3 text-lg font-extrabold">design.md</p>
              <p className="text-sm font-semibold text-[#6b6b66]">every claim cited</p>
              </div>
            </div>
          </Piece>
          <Piece node="a-claude" x="58%" y="0%" w="40%" r={3} mx="56%" my="0%" mw="44%">
            <Sticky tone="var(--lp-butter)" i={1}>
              <span className="lp-pin" data-pin aria-hidden />
              <h3>Claude Code</h3>
              <p className="mt-1">over MCP</p>
            </Sticky>
          </Piece>
          <Piece node="a-cursor" x="54%" y="52%" w="40%" r={-2} mx="48%" my="50%" mw="52%">
            <Sticky tone="var(--lp-mint)" i={2}>
              <span className="lp-pin" data-pin aria-hidden />
              <h3>Cursor</h3>
              <p className="mt-1">or anything that reads a markdown file</p>
            </Sticky>
          </Piece>
          <Piece x="0%" y="78%" w="46%" r={-2} mx="0%" my="84%" mw="46%">
            <Ink red>“build the pricing page from design.md”</Ink>
          </Piece>
        </div>
      </div>
    </Stage>
  );
}

/* ------------------------------------------------------------------ 7. questions */

const FAQ = [
  ["Which coding agents does it work with?", "Anything that reads a markdown file, plus MCP clients such as Claude Code and Cursor, which can fetch the spec and references directly with a personal token."],
  ["Does it copy the designs I save?", "No. design.md describes the style (colours, type, spacing, components) so you can build something of your own. Logos, text and images are never reproduced."],
  ["Who can see my board?", "Only you. Your board is private, files are stored per account, and agent tokens are read only and can be revoked at any time."],
  ["What does the AI look at?", "Each saved image is analysed once for colours, type, layout and components. Specs are written from those analyses plus a few key images, which keeps them fast and cheap."],
  ["Which browsers are supported?", "Chrome for now. The web app works in any modern browser; Firefox and Safari extensions come later."],
  ["What does it cost?", "It is free during early access, with 30 AI spec generations a month. Saving, organising, editing and downloading are not limited."],
] as const;

function Questions() {
  return (
    <section id="questions" className="scroll-mt-8 border-t-[1.5px] border-dashed border-[rgb(21_21_21/0.2)] py-20 min-[900px]:py-28" aria-labelledby="q-title">
      <h2 id="q-title" className="lp-heading">
        Questions
      </h2>
      <div className="mt-12 columns-1 gap-7 min-[700px]:columns-2 min-[1100px]:columns-3">
        {FAQ.map(([q, a], i) => (
          <details key={q} className="lp-card mb-7 break-inside-avoid" style={{ rotate: `${[-1.2, 0.8, -0.4, 1.1, -0.9, 0.5][i]}deg` }}>
            <summary>
              {q}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 8. close */

function Close() {
  return (
    <section className="flex justify-center py-20 min-[900px]:py-32" aria-labelledby="close-title">
      <div className="w-full max-w-[620px] -rotate-1">
        <Sticky tone="var(--lp-butter)" className="!p-8 sm:!p-12">
          <span className="lp-pin" aria-hidden />
          <h2 id="close-title" className="lp-heading">
            Your next page should look like your board.
          </h2>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <StartTag />
            <span className="text-sm font-bold text-[#4a4a44]">Free during early access: 30 AI specs a month, no card.</span>
          </div>
        </Sticky>
      </div>
    </section>
  );
}
