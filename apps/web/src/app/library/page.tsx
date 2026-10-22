import { connection } from "next/server";
import Link from "next/link";
import { CAPTURES_BUCKET, REFERENCE_TYPES, type Reference } from "@justcreate/shared";
import { AutoRefresh } from "@/components/auto-refresh";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";
import { ReferenceCard } from "./reference-card";

// Per-user page: nothing useful to prerender.
export const instant = false;

const PAGE_SIZE = 200;

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  await connection(); // per-request: auth reads use the clock
  const { type } = await searchParams;
  const activeType = REFERENCE_TYPES.find((t) => t === type);

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  let query = supabase
    .from("references")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (activeType) query = query.eq("type", activeType);
  const { data, error } = await query;
  const references = (data ?? []) as Reference[];

  const paths = references.map((r) => r.thumbnail_path).filter((p): p is string => Boolean(p));
  const signed = paths.length
    ? ((await supabase.storage.from(CAPTURES_BUCKET).createSignedUrls(paths, 60 * 60)).data ?? [])
    : [];
  const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl ?? undefined]));

  return (
    <>
      <SiteHeader email={userData.user?.email} />
      <AutoRefresh />
      <main className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <FilterLink label="All" href="/library" active={!activeType} />
          {REFERENCE_TYPES.map((t) => (
            <FilterLink key={t} label={t} href={`/library?type=${t}`} active={activeType === t} />
          ))}
        </div>

        {error && <p className="text-sm text-red-600">Couldn&apos;t load references: {error.message}</p>}

        {!error && references.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center text-sm text-foreground/60">
            <p>Nothing saved yet.</p>
            <p>
              <Link href="/connect" className="underline">
                Connect the extension
              </Link>
              , then right-click any image and choose “Save to JUSTCREATE”.
            </p>
          </div>
        ) : (
          <ul className="columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5">
            {references.map((r) => (
              <li key={r.id} className="mb-4 break-inside-avoid">
                <ReferenceCard
                  reference={r}
                  imageUrl={r.thumbnail_path ? urlByPath.get(r.thumbnail_path) : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 capitalize ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-foreground/20 hover:border-foreground/50"
      }`}
    >
      {label}
    </Link>
  );
}
