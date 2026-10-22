import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";
import { ConnectExtension } from "./connect-extension";

// Per-user page: nothing useful to prerender.
export const instant = false;

export default async function ConnectPage() {
  await connection(); // per-request: auth reads use the clock
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return (
    <>
      <SiteHeader email={data.user?.email} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16">
        <h1 className="text-2xl font-semibold">Connect the extension</h1>
        <ConnectExtension />
      </main>
    </>
  );
}
