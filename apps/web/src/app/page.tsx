import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Reveal, TaglineReveal } from "@/components/landing-motion";
import { SiteFooter } from "@/components/site-footer";
import { createClient, sessionUser } from "@/lib/supabase/server";

// Signed-in users go straight to their board; per request, so not prerendered.
export const instant = false;

export const metadata: Metadata = {
  title: "JustCreate: turn saved inspiration into a design.md your coding agent can build from",
  description:
    "Save designs from anywhere with one right click, group them on a canvas, and get a cited design.md with real colours, type and spacing for Claude Code or Cursor.",
};

const CTA = "Start your board";

export default async function Home({ searchParams }: PageProps<"/">) {
  await connection();
  // If the sign-in link falls back to the Site URL, the code lands here.
  const { code } = await searchParams;
  if (typeof code === "string") redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  if (await sessionUser(await createClient())) redirect("/board");

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-background">
        Skip to content
      </a>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 sm:px-6">
        <span className="wordmark text-lg">JustCreate</span>
        <Link href="/login" className={`${button} text-sm`}>
          Sign in
        </Link>
      </header>

      <main id="main" className="handwritten flex flex-col">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-24 pt-12 sm:px-6 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <h1 className="max-w-170 text-5xl text-balance">
              Turn the designs you save into a spec your agent can build
            </h1>
            <p className="max-w-170 text-lg text-foreground/70 text-pretty">
              Right click anything you love on the web. JustCreate groups it into style clusters and writes a design.md
              with real hex codes, type and spacing, every line cited to the reference it came from.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/login" className={`${button} ${primary} text-base`}>
                {CTA}
              </Link>
              <span className="text-sm text-foreground/60">Free during early access. No card.</span>
            </div>
          </div>
          <Reveal>
            <SpecPreview />
          </Reveal>
        </section>

        {/* Problem → solution */}
        <section className="border-y border-foreground/20 bg-foreground/2">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-24 sm:px-6 md:grid-cols-2">
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-tight text-balance">Your inspiration is scattered. Your agent sees none of it.</h2>
            </Reveal>
            <Reveal className="flex flex-col gap-4 text-base text-foreground/70 text-pretty">
              <p>
                Screenshots sit in a downloads folder, bookmarks in three browsers, posts in a likes tab. When you finally ask
                Claude Code or Cursor for a page, you describe the look in a sentence and get something generic back.
              </p>
              <p>
                JustCreate keeps every reference in one place and turns the board into the brief: palette, typography, layout,
                components and motion, written for a coding agent to follow.
              </p>
            </Reveal>
          </div>
        </section>

        {/* Tagline reveal */}
        <section className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
          <TaglineReveal lines={["Stop describing the vibe.", "Give your agent the references", "and the values behind them."]} />
        </section>

        {/* Benefits */}
        <section aria-labelledby="benefits" className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
          <h2 id="benefits" className="sr-only">
            What you get
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {BENEFITS.map(([title, body]) => (
              <Reveal key={title} className="flex flex-col gap-3 rounded-2xl sketch border-foreground/70 p-6">
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-base text-foreground/70 text-pretty">{body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-foreground/20">
          <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
            <h2 className="mb-12 text-3xl font-semibold tracking-tight">How it works</h2>
            <ol className="grid gap-8 md:grid-cols-3">
              {STEPS.map(([title, body], i) => (
                <Reveal key={title}>
                  <li className="flex flex-col gap-3">
                    <span className="font-mono text-sm text-foreground/50">0{i + 1}</span>
                    <h3 className="text-xl font-semibold">{title}</h3>
                    <p className="text-base text-foreground/70 text-pretty">{body}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-foreground/20">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-24 sm:px-6 md:grid-cols-[1fr_2fr]">
            <h2 className="text-3xl font-semibold tracking-tight">Questions</h2>
            <div className="flex flex-col">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group border-b border-foreground/20 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold focus-visible:outline-2">
                    {q}
                    <span aria-hidden className="text-foreground/50 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-base text-foreground/70 text-pretty">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-foreground/20">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-24 sm:px-6">
            <h2 className="max-w-170 text-4xl font-semibold tracking-tight text-balance">Your next page should look like your board.</h2>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/login" className={`${button} ${primary} text-base`}>
                {CTA}
              </Link>
              <span className="text-sm text-foreground/60">Free during early access: 30 AI specs a month, no card.</span>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

const button =
  "inline-flex items-center rounded-full sketch border-foreground/70 px-3 py-2 font-semibold transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-foreground/50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2";
const primary = "border-foreground bg-foreground px-4 text-background hover:opacity-90";

const BENEFITS = [
  ["Save in two clicks", "Right click any image, screenshot a region or a full page, or save a YouTube video or an X post. The source link and metadata come along."],
  ["Clusters you control", "AI groups references by look (palette, layout, type, effects) and names the groups. Accept, rename, merge or reject; your choices stick."],
  ["Specs with receipts", "Each claim in design.md cites its reference and says whether it was observed or inferred. Palettes are measured from pixels, not guessed."],
  ["Plugs into your agent", "Download the file, or connect Claude Code and Cursor over MCP so they can pull the latest spec and references themselves."],
] as const;

const STEPS = [
  ["Capture", "Install the extension and save what you like as you browse. Everything lands on your board."],
  ["Curate", "Arrange references on an infinite canvas. Suggested clusters appear as your board grows."],
  ["Generate", "One click writes design.md. Edit it, rewrite a single section, then hand it to your coding agent."],
] as const;

const FAQ = [
  ["Which coding agents does it work with?", "Anything that reads a markdown file, plus MCP clients such as Claude Code and Cursor, which can fetch the spec and references directly with a personal token."],
  ["Does it copy the designs I save?", "No. design.md describes the style (colours, type, spacing, components) so you can build something of your own. Logos, text and images are never reproduced."],
  ["Who can see my board?", "Only you. Your board is private, files are stored per account, and agent tokens are read only and can be revoked at any time."],
  ["What does the AI look at?", "Each saved image is analysed once for colours, type, layout and components. Specs are written from those analyses plus a few key images, which keeps them fast and cheap."],
  ["Which browsers are supported?", "Chrome for now. The web app works in any modern browser; Firefox and Safari extensions come later."],
  ["What does it cost?", "It is free during early access, with 30 AI spec generations a month. Saving, organising, editing and downloading are not limited."],
] as const;

/** Hero visual: a real design.md excerpt, the product's output. */
function SpecPreview() {
  return (
    <figure className="rounded-2xl sketch border-foreground/70 bg-foreground/3 p-2 shadow-sm">
      <div className="rounded-xl sketch border-foreground/70 bg-background p-6 font-mono text-xs leading-relaxed">
        <p className="text-foreground/50"># design.md — Night shift dashboards</p>
        <p className="mt-4 font-semibold">## 2. Color palette</p>
        <div className="mt-3 flex flex-col gap-2">
          {[
            ["#0F0F1A", "Background", "Observed", "a91f2c"],
            ["#FF2D9A", "Accent", "Observed", "3be07d"],
            ["#00E5FF", "Data highlight", "Observed", "3be07d"],
            ["#2E283D", "Surface", "Inferred", "c41b88"],
          ].map(([hex, role, kind, ref]) => (
            <p key={hex} className="flex flex-wrap items-center gap-2">
              <span aria-hidden className="h-3 w-3 rounded-sm sketch border-foreground/70" style={{ background: hex }} />
              <span className="w-16">{hex}</span>
              <span className="w-28 text-foreground/70">{role}</span>
              <span className="text-foreground/50">
                **{kind}** [ref:{ref}]
              </span>
            </p>
          ))}
        </div>
        <p className="mt-4 font-semibold">## 3. Typography</p>
        <p className="mt-2 text-foreground/70">Display: Space Grotesk 600, 48/1.05, tracking −2% **Inferred** [ref:a91f2c]</p>
      </div>
      <figcaption className="px-2 pt-2 text-xs text-foreground/50">Every value cites the saved reference it came from.</figcaption>
    </figure>
  );
}
