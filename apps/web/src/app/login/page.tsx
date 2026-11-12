import { LoginForm } from "./login-form";

// Per-user page: nothing useful to prerender.
export const instant = false;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Sign in to JustCreate</h1>
      {error === "demo" || error === "demo-busy" ? (
        <p className="text-sm text-red-600">{error === "demo" ? "The demo board isn't available right now." : "The demo is busy right now. Try again in a little while."}</p>
      ) : (
        error && <p className="text-sm text-red-600">That link didn&apos;t work. Request a new one.</p>
      )}
      <LoginForm next={typeof next === "string" ? next : "/board"} />
      <form action="/demo" method="post" className="flex flex-col gap-2 border-t border-foreground/15 pt-5">
        <p className="text-sm text-foreground/70">Just looking? Open a demo board with sample references and AI clusters. No email needed.</p>
        <button className="rounded-md border border-foreground/40 px-3 py-2 text-sm font-medium hover:bg-foreground/[0.05]">Try the demo board</button>
      </form>
    </main>
  );
}
