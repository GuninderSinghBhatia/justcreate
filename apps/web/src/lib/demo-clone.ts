import "server-only";

import { randomUUID } from "node:crypto";
import { CAPTURES_BUCKET } from "@justcreate/shared";
import { createAdminClient } from "@/lib/supabase/server";
import { DEMO_BOARD, DEMO_DOMAIN } from "@/lib/demo";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const KEEP_HOURS = 24;
const MAX_DEMOS = 300;

type Row = Record<string, unknown>;

/**
 * Gives a visitor their own copy of the template account's board: images, AI analysis, clusters and
 * design.md, so nothing one visitor does shows up for another. Every id (and the owner's folder in
 * every storage path) is swapped for a fresh one by rewriting the rows as JSON, which also covers
 * ids inside the canvas document.
 */
export async function createDemoAccount(templateId: string): Promise<{ email: string } | { error: string }> {
  const admin = createAdminClient();
  await removeOldDemos(templateId);

  const { count } = await admin.from("boards").select("id", { count: "exact", head: true }).eq("name", DEMO_BOARD);
  if ((count ?? 0) >= MAX_DEMOS) return { error: "busy" };

  const read = async (table: string) => {
    const { data, error } = await admin.from(table).select("*").eq("user_id", templateId);
    if (error) throw new Error(`demo template ${table}: ${error.message}`);
    return (data ?? []) as Row[];
  };
  const [references, boards, items, analyses, embeddings, clusters, members, specs] = await Promise.all([
    read("references"),
    read("boards"),
    read("board_items"),
    read("analyses"),
    read("embeddings"),
    read("clusters"),
    read("cluster_members"),
    read("design_specs"),
  ]);
  if (!references.length || !boards.length) return { error: "not set up" };

  const email = `demo-${randomUUID()}@${DEMO_DOMAIN}`;
  const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !created.user) throw new Error(`demo user: ${error?.message}`);
  const userId = created.user.id;

  try {
    // A fresh id for everything the template owns, rewritten wherever it appears.
    const all = JSON.stringify({ references, boards, items, analyses, embeddings, clusters, members, specs });
    const swaps = new Map<string, string>([[templateId, userId]]);
    for (const id of new Set(all.match(UUID))) if (!swaps.has(id)) swaps.set(id, randomUUID());
    const clone = (rows: Row[]) => JSON.parse(JSON.stringify(rows).replace(UUID, (id) => swaps.get(id) ?? id)) as Row[];
    const put = async (table: string, rows: Row[]) => {
      if (!rows.length) return;
      const { error: insertError } = await admin.from(table).insert(rows);
      if (insertError) throw new Error(`demo ${table}: ${insertError.message}`);
    };

    const refs = clone(references);
    for (const r of refs) delete r.search; // generated column

    // Files first, so a card never points at nothing.
    const copies: Promise<void>[] = [];
    references.forEach((old, i) => {
      for (const column of ["file_path", "thumbnail_path"]) {
        const from = old[column];
        const to = refs[i][column];
        if (typeof from !== "string" || typeof to !== "string") continue;
        copies.push(
          admin.storage
            .from(CAPTURES_BUCKET)
            .copy(from, to)
            .then(({ error: copyError }) => {
              if (copyError) throw new Error(`demo file ${from}: ${copyError.message}`);
            }),
        );
      }
    });
    await Promise.all(copies);

    await put("references", refs);
    // created_at is when this copy was made: it starts the copy's 24 hours.
    const now = new Date().toISOString();
    await put("boards", clone(boards).map((b) => ({ ...b, name: DEMO_BOARD, created_at: now, updated_at: now })));
    // These only need the references and the board; members need their clusters.
    await Promise.all([
      put("board_items", clone(items)),
      put("analyses", clone(analyses)),
      put("embeddings", clone(embeddings)),
      put("clusters", clone(clusters)).then(() => put("cluster_members", clone(members))),
      put("design_specs", clone(specs)),
    ]);
  } catch (err) {
    await deleteAccount(userId); // no half-made demo is left behind
    throw err;
  }
  return { email };
}

async function deleteAccount(userId: string) {
  const admin = createAdminClient();
  const files = admin.storage.from(CAPTURES_BUCKET);
  const { data } = await files.list(userId, { limit: 1000 });
  if (data?.length) await files.remove(data.map((f) => `${userId}/${f.name}`));
  await admin.auth.admin.deleteUser(userId);
}

/** Demo accounts older than a day go, files and all. Only accounts on the demo domain are ever touched. */
async function removeOldDemos(templateId: string) {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - KEEP_HOURS * 3_600_000).toISOString();
  const { data } = await admin
    .from("boards")
    .select("user_id")
    .eq("name", DEMO_BOARD)
    .lt("created_at", cutoff)
    .neq("user_id", templateId)
    .limit(20);
  for (const { user_id } of data ?? []) {
    const { data: found } = await admin.auth.admin.getUserById(user_id);
    if (found.user?.email?.endsWith(`@${DEMO_DOMAIN}`)) await deleteAccount(user_id);
  }
}
