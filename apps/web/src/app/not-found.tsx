import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-4 py-24">
      <p className="font-mono text-sm text-foreground/50">404</p>
      <h1 className="text-3xl font-semibold tracking-tight text-balance">This page isn&apos;t on any board.</h1>
      <p className="text-base text-foreground/70">The link may be old, or the board was deleted.</p>
      <Link href="/" className="rounded-full bg-foreground px-4 py-2 text-base font-semibold text-background">
        Back to JUSTCREATE
      </Link>
    </main>
  );
}
