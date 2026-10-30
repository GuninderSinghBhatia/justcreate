import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-foreground/10">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-foreground/60 sm:px-6">
        <span>JustCreate</span>
        <nav aria-label="Legal" className="flex gap-6">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
