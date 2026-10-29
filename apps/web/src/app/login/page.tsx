import { LoginForm } from "./login-form";

// Per-user page: nothing useful to prerender.
export const instant = false;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Sign in to JUSTCREATE</h1>
      {error && <p className="text-sm text-red-600">That link didn&apos;t work. Request a new one.</p>}
      <LoginForm next={typeof next === "string" ? next : "/board"} />
    </main>
  );
}
