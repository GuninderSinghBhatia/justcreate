import Link from "next/link";
import { AccountMenu } from "./account-menu";

/**
 * The top bar of every signed-in page, one layout everywhere:
 *
 *   JUSTCREATE │ context (what you're looking at) … tools │ account
 *
 * There is one board, so the logo is the way back to it. `context` is the page's state or document
 * (save status, which cluster's design.md); `tools` are its controls. Extension, Settings and Sign
 * out live in the account menu.
 */
export function SiteHeader({ context, tools }: { context?: React.ReactNode; tools?: React.ReactNode }) {
  return (
    // z-30: its menus must stay above the canvas. Coloured like the canvas (--bar-bg, globals.css).
    <header data-bar-root className="relative z-30 flex h-12 shrink-0 items-center gap-1 border-b border-foreground/10 bg-(--bar-bg) px-3 font-sans text-[13px] sm:px-4">
      <Link href="/board" title="Your board" className="bar-ctl wordmark mr-1 rounded-lg px-1.5 py-1 text-[15px] leading-none hover:bg-foreground/[0.05]">
        JUSTCREATE
      </Link>
      <span aria-hidden className="mx-2 h-5 w-px shrink-0 bg-foreground/10" />
      <div data-bar="context" className="flex min-w-0 flex-1 items-center gap-2">{context}</div>
      {tools && <div data-bar="tools" className="flex shrink-0 items-center gap-1">{tools}</div>}
      <span aria-hidden className="mx-1.5 h-5 w-px shrink-0 bg-foreground/10" />
      <AccountMenu />
    </header>
  );
}

/** The page's name in the bar's context slot, for pages without a document of their own. */
export function BarTitle({ children }: { children: React.ReactNode }) {
  return <span className="truncate font-semibold text-foreground/80">{children}</span>;
}
