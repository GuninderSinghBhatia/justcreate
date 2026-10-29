import Link from "next/link";
import { AccountMenu } from "./account-menu";

/**
 * The app's top bar. With children (the board's controls) it is one compact row: logo, the
 * page's controls, and Extension / Settings / Sign out folded into an account menu.
 */
export function SiteHeader({ children }: { children?: React.ReactNode }) {
  if (children) {
    return (
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-foreground/10 px-4">
        <Link href="/board" className="font-hand text-base">
          JUSTCREATE
        </Link>
        <span aria-hidden className="h-5 w-px bg-foreground/15" />
        <div className="flex min-w-0 flex-1 items-center gap-3 text-sm">{children}</div>
        <AccountMenu />
      </header>
    );
  }
  return (
    <header className="flex items-center justify-between gap-4 border-b border-foreground/10 px-4 py-3 sm:px-6">
      <Link href="/board" className="font-hand text-lg">
        JUSTCREATE
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/connect" className="hover:underline">
          Extension
        </Link>
        <Link href="/settings" className="hover:underline">
          Settings
        </Link>
        <form action="/auth/signout" method="post">
          <button className="text-foreground/60 hover:text-foreground">Sign out</button>
        </form>
      </nav>
    </header>
  );
}
