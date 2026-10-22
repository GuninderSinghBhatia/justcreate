import { redirect } from "next/navigation";

// Per-user page: nothing useful to prerender.
export const instant = false;

export default async function Home({ searchParams }: PageProps<"/">) {
  // If the sign-in link falls back to the Site URL, the code lands here.
  const { code } = await searchParams;
  if (typeof code === "string") redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  redirect("/library");
}
