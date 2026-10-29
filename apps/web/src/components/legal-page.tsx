import Link from "next/link";
import { SiteFooter } from "./site-footer";

/** Shared shell for the privacy policy and terms. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <>
      <header className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <Link href="/" className="wordmark text-lg">
          JUSTCREATE
        </Link>
      </header>
      <main className="prose-spec mx-auto w-full max-w-3xl flex-1 px-4 pb-24 text-base sm:px-6">
        <h1>{title}</h1>
        <p className="text-sm text-foreground/60">Last updated {updated}. Draft: review with a lawyer before public launch.</p>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
