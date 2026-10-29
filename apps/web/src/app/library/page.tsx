import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import type { Reference } from "@justcreate/shared";
import { AutoRefresh } from "@/components/auto-refresh";
import { FiltersBar } from "@/components/filters-bar";
import { ReferenceGrid } from "@/components/reference-grid";
import { SiteHeader } from "@/components/site-header";
import { searchReferences, toViews } from "@/lib/references";
import { createClient } from "@/lib/supabase/server";

// Per-user page: nothing useful to prerender.
export const instant = false;

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  await connection(); // per-request: auth reads use the clock
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const inbox = str("view") === "inbox";

  const supabase = await createClient();
  const [result, labelRows] = await Promise.all([
    searchReferences(supabase, {
      q: str("q"),
      type: str("type"),
      label: str("label"),
      from: str("from"),
      to: str("to"),
      inbox,
    }),
    supabase.from("references").select("labels").not("labels", "eq", "{}"),
  ]);
  const references = await toViews(supabase, (result.data ?? []) as Reference[]);
  const labels = [...new Set((labelRows.data ?? []).flatMap((r) => r.labels as string[]))].sort();
  const filtered = Boolean(str("q") || str("type") || str("label") || str("from") || str("to"));

  return (
    <>
      <SiteHeader />
      <AutoRefresh />
      <main className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-lg font-semibold">{inbox ? "Inbox" : "Library"}</h1>
          <p className="text-xs text-foreground/50">
            {inbox ? "Saved items not on the board. " : ""}Drop or paste images to upload.
          </p>
        </div>
        <Suspense>
          <FiltersBar labels={labels} />
        </Suspense>
        {result.error && <p className="text-sm text-red-600">Couldn&apos;t load references: {result.error.message}</p>}
        <ReferenceGrid
          references={references}
          empty={
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center text-sm text-foreground/60">
              {filtered ? (
                <p>Nothing matches these filters.</p>
              ) : inbox ? (
                <p>Inbox is empty: everything you saved is on your board.</p>
              ) : (
                <>
                  <p>Nothing saved yet.</p>
                  <p>
                    <Link href="/connect" className="underline">
                      Connect the extension
                    </Link>
                    , right-click any image and choose “Save to JUSTCREATE”, or drop an image here.
                  </p>
                </>
              )}
            </div>
          }
        />
      </main>
    </>
  );
}
