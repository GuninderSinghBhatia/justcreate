import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { LandingBoard } from "@/components/landing/landing-board";
import { createClient, sessionUser } from "@/lib/supabase/server";
import "./landing.css";

// Signed-in users go straight to their board; per request, so not prerendered.
export const instant = false;

export const metadata: Metadata = {
  title: "JustCreate: turn saved inspiration into a design.md your coding agent can build from",
  description:
    "Save designs from anywhere with one right click, group them on a canvas, and get a cited design.md with real colours, type and spacing for Claude Code or Cursor.",
};

export default async function Home({ searchParams }: PageProps<"/">) {
  await connection();
  // If the sign-in link falls back to the Site URL, the code lands here.
  const { code } = await searchParams;
  if (typeof code === "string") redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  if (await sessionUser(await createClient())) redirect("/board");

  return <LandingBoard />;
}
