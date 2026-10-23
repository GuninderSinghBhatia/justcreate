import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CAPTURES_BUCKET, type Analysis, type Reference } from "@justcreate/shared";

/** What client components need to render a reference card or its detail drawer. */
export interface ReferenceView extends Reference {
  imageUrl?: string;
  fileUrl?: string;
  analysis?: Pick<Analysis, "caption" | "tags" | "palette" | "mood" | "components" | "effects" | "fonts"> | null;
}

const SIGNED_URL_SECONDS = 60 * 60;

/** Adds signed image URLs (thumbnail + full file) and the analysis, in two batched calls. */
export async function toViews(supabase: SupabaseClient, references: Reference[]): Promise<ReferenceView[]> {
  if (!references.length) return [];
  const paths = [
    ...new Set(references.flatMap((r) => [r.thumbnail_path, r.file_path]).filter((p): p is string => Boolean(p))),
  ];
  const [signed, analyses] = await Promise.all([
    paths.length
      ? supabase.storage.from(CAPTURES_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS)
      : Promise.resolve({ data: [] }),
    supabase
      .from("analyses")
      .select("reference_id, caption, tags, palette, mood, components, effects, fonts")
      .in(
        "reference_id",
        references.map((r) => r.id),
      ),
  ]);
  const url = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl ?? undefined]));
  const analysis = new Map((analyses.data ?? []).map((a) => [a.reference_id, a]));
  return references.map((r) => ({
    ...r,
    labels: r.labels ?? [],
    imageUrl: r.thumbnail_path ? url.get(r.thumbnail_path) : undefined,
    fileUrl: r.file_path ? url.get(r.file_path) : undefined,
    analysis: analysis.get(r.id) ?? null,
  }));
}

export interface ReferenceFilters {
  q?: string;
  type?: string;
  label?: string;
  from?: string;
  to?: string;
  inbox?: boolean;
}

/** Library query with full-text search and filters. */
export async function searchReferences(supabase: SupabaseClient, f: ReferenceFilters, limit = 300) {
  let query = supabase
    .from(f.inbox ? "inbox_references" : "references")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (f.q?.trim()) {
    // Prefix match on every word: "neon das" finds "neon dashboard".
    const words = f.q.trim().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}_-]/gu, "")).filter(Boolean);
    if (words.length) query = query.textSearch("search", words.map((w) => `${w}:*`).join(" & "), { config: "simple" });
  }
  if (f.type) query = query.eq("type", f.type);
  if (f.label) query = query.contains("labels", [f.label]);
  if (f.from) query = query.gte("created_at", f.from);
  if (f.to) query = query.lte("created_at", `${f.to}T23:59:59.999Z`);
  return query;
}
