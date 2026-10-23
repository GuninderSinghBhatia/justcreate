import Link from "next/link";
import { connection } from "next/server";
import { CAPTURES_BUCKET } from "@justcreate/shared";
import { SiteHeader } from "@/components/site-header";
import { createBoard } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

// Per-user page: nothing useful to prerender.
export const instant = false;

export default async function BoardsPage() {
  await connection();
  const supabase = await createClient();
  const [{ data: userData }, { data: boards }, { data: counts }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("boards")
      .select("id, name, updated_at, cover:references!boards_cover_reference_id_fkey(thumbnail_path)")
      .order("updated_at", { ascending: false }),
    supabase.from("board_items").select("board_id"),
  ]);

  const countBy = new Map<string, number>();
  for (const { board_id } of counts ?? []) countBy.set(board_id, (countBy.get(board_id) ?? 0) + 1);

  // Covers: the chosen cover, else the board's most recent item.
  const coverPath = new Map<string, string>();
  for (const b of boards ?? []) {
    const cover = b.cover as unknown as { thumbnail_path: string | null } | null;
    if (cover?.thumbnail_path) coverPath.set(b.id, cover.thumbnail_path);
  }
  const missing = (boards ?? []).filter((b) => !coverPath.has(b.id)).map((b) => b.id);
  if (missing.length) {
    const { data: recent } = await supabase
      .from("board_items")
      .select("board_id, created_at, reference:references(thumbnail_path)")
      .in("board_id", missing)
      .order("created_at", { ascending: false });
    for (const item of recent ?? []) {
      const ref = item.reference as unknown as { thumbnail_path: string | null } | null;
      if (!coverPath.has(item.board_id) && ref?.thumbnail_path) coverPath.set(item.board_id, ref.thumbnail_path);
    }
  }
  const paths = [...new Set(coverPath.values())];
  const signed = paths.length
    ? ((await supabase.storage.from(CAPTURES_BUCKET).createSignedUrls(paths, 3600)).data ?? [])
    : [];
  const url = new Map(signed.map((s) => [s.path, s.signedUrl]));

  return (
    <>
      <SiteHeader email={userData.user?.email} />
      <main className="flex flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-lg font-semibold">Boards</h1>
          <form action={createBoard} className="flex gap-2">
            <input
              name="name"
              placeholder="New board name"
              aria-label="New board name"
              className="rounded-md border border-foreground/20 bg-transparent px-3 py-1.5 text-sm"
            />
            <button className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background">
              Create board
            </button>
          </form>
        </div>

        {(boards ?? []).length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center text-sm text-foreground/60">
            <p>No boards yet.</p>
            <p>Create one for a project or a style you&apos;re collecting.</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {boards!.map((b) => {
              const cover = coverPath.get(b.id);
              const src = cover ? url.get(cover) : undefined;
              return (
                <li key={b.id}>
                  <Link
                    href={`/boards/${b.id}`}
                    className="block overflow-hidden rounded-lg border border-foreground/10 hover:border-foreground/30"
                  >
                    <span className="block aspect-[4/3] bg-foreground/5">
                      {src && (
                        // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs
                        <img src={src} alt="" className="h-full w-full object-cover" />
                      )}
                    </span>
                    <span className="flex items-baseline justify-between gap-2 p-3">
                      <span className="truncate font-medium">{b.name}</span>
                      <span className="shrink-0 text-xs text-foreground/50">
                        {countBy.get(b.id) ?? 0} items
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
