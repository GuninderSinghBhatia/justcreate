import Link from "next/link";

export function SiteHeader({ email }: { email?: string }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-foreground/10 px-4 py-3 sm:px-6">
      <Link href="/boards" className="font-semibold tracking-tight">
        JUSTCREATE
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/boards" className="hover:underline">
          Boards
        </Link>
        <Link href="/library" className="hover:underline">
          Library
        </Link>
        <Link href="/connect" className="hover:underline">
          Extension
        </Link>
        {email && <span className="hidden text-foreground/60 sm:inline">{email}</span>}
        <form action="/auth/signout" method="post">
          <button className="text-foreground/60 hover:text-foreground">Sign out</button>
        </form>
      </nav>
    </header>
  );
}
