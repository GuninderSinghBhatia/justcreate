import Link from "next/link";
import { AccountMenu } from "./account-menu";

type Section = "board" | "spec";

/**
 * The top bar of every signed-in page, one layout everywhere:
 *
 *   JUSTCREATE │ Board · design.md │ context (what you're looking at) … tools │ account
 *
 * `section` underlines the tab you're in; `context` names the page or document (the board's
 * name, which design.md); `tools` are the page's own controls. Extension, Settings and Sign out
 * live in the account menu.
 */
export function SiteHeader({ section, context, tools }: { section?: Section; context?: React.ReactNode; tools?: React.ReactNode }) {
  return (
    // z-30: its menus must stay above the canvas. Coloured like the canvas (--bar-bg, globals.css).
    <header data-bar-root className="relative z-30 flex h-12 shrink-0 items-center gap-1 border-b border-foreground/10 bg-(--bar-bg) px-3 font-sans text-[13px] sm:px-4">
      <Link href="/board" className="bar-ctl wordmark mr-1 rounded-lg px-1.5 py-1 text-[15px] leading-none hover:bg-foreground/[0.05]">
        JUSTCREATE
      </Link>
      {/* font-sans: the base styles give nav elements the handwriting face. */}
      <nav aria-label="Main" className="flex h-full items-stretch font-sans">
        <Tab href="/board" on={section === "board"}>
          Board
        </Tab>
        <Tab href="/board/spec" on={section === "spec"}>
          design.md
        </Tab>
      </nav>
      <span aria-hidden className="mx-2 h-5 w-px shrink-0 bg-foreground/10" />
      <div data-bar="context" className="flex min-w-0 flex-1 items-center gap-2">{context}</div>
      {tools && <div data-bar="tools" className="flex shrink-0 items-center gap-1">{tools}</div>}
      <span aria-hidden className="mx-1.5 h-5 w-px shrink-0 bg-foreground/10" />
      <AccountMenu />
    </header>
  );
}

function Tab({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`bar-ctl -mb-px inline-flex items-center border-b-2 px-2.5 transition-colors ${
        on ? "border-foreground font-semibold text-foreground" : "border-transparent text-foreground/55 hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

/** The page's name in the bar's context slot, for pages without a document of their own. */
export function BarTitle({ children }: { children: React.ReactNode }) {
  return <span className="truncate font-semibold text-foreground/80">{children}</span>;
}
