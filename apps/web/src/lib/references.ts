import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CAPTURES_BUCKET, type Analysis, type Reference } from "@justcreate/shared";

/** What client components need to render a reference card or its detail drawer. */
export interface ReferenceView extends Reference {
  imageUrl?: string;
  fileUrl?: string;
  analysis?: (Pick<Analysis, "caption" | "tags" | "palette" | "mood" | "components" | "effects" | "fonts"> & {
    /** Named design styles the worker matched (apps/worker/worker/styles.py), best first. */
    styles?: { key: string; name: string; score: number }[] | null;
  }) | null;
}

type AnalysisView = NonNullable<ReferenceView["analysis"]>;
/** Embed this in a references select to save toViews a round trip: `references(*, ${ANALYSIS_EMBED})`. */
export const ANALYSIS_EMBED = "analyses(caption, tags, palette, mood, components, effects, fonts, styles:inferred->styles)";
/** A reference row, with its analysis when the query embedded ANALYSIS_EMBED. */
export type ReferenceRow = Reference & { analyses?: AnalysisView[] | AnalysisView | null };

const SIGNED_URL_SECONDS = 60 * 60;
// Signed links are reused while they have 20+ minutes left: fewer storage calls on every refresh,
// and stable URLs the browser can cache. Paths are per user, and a path is only ever looked up
// for a reference the caller's own (RLS) query returned.
const REUSE_MS = 40 * 60 * 1000;
const signedCache = new Map<string, { url: string; until: number }>();

export async function signedUrls(supabase: SupabaseClient, paths: string[]) {
  const now = Date.now();
  const urls = new Map<string, string>();
  const missing: string[] = [];
  for (const path of paths) {
    const hit = signedCache.get(path);
    if (hit && hit.until > now) urls.set(path, hit.url);
    else missing.push(path);
  }
  if (!missing.length) return urls;
  if (signedCache.size > 5000) for (const [p, c] of signedCache) if (c.until <= now) signedCache.delete(p);
  const { data } = await supabase.storage.from(CAPTURES_BUCKET).createSignedUrls(missing, SIGNED_URL_SECONDS);
  for (const s of data ?? []) {
    if (!s.path || !s.signedUrl) continue;
    signedCache.set(s.path, { url: s.signedUrl, until: now + REUSE_MS });
    urls.set(s.path, s.signedUrl);
  }
  return urls;
}

/** Adds signed image URLs (thumbnail + full file) and the analysis (fetched unless embedded). */
/** A link the app may render: http(s) only, else null. */
export function webLink(url: string | null | undefined) {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

export async function toViews(supabase: SupabaseClient, references: ReferenceRow[]): Promise<ReferenceView[]> {
  if (!references.length) return [];
  const paths = [
    ...new Set(references.flatMap((r) => [r.thumbnail_path, r.file_path]).filter((p): p is string => Boolean(p))),
  ];
  const embedded = references.every((r) => "analyses" in r);
  const [url, fetched] = await Promise.all([
    signedUrls(supabase, paths),
    embedded
      ? null
      : supabase
          .from("analyses")
          .select("reference_id, caption, tags, palette, mood, components, effects, fonts, styles:inferred->styles")
          .in(
            "reference_id",
            references.map((r) => r.id),
          ),
  ]);
  const analysis = new Map<string, AnalysisView>((fetched?.data ?? []).map((a) => [a.reference_id, a as unknown as AnalysisView]));
  return references.map(({ analyses, ...r }) => ({
    ...r,
    source_url: webLink(r.source_url),
    page_url: webLink(r.page_url),
    labels: r.labels ?? [],
    imageUrl: r.thumbnail_path ? url.get(r.thumbnail_path) : undefined,
    fileUrl: r.file_path ? url.get(r.file_path) : undefined,
    analysis: (embedded ? (Array.isArray(analyses) ? analyses[0] : analyses) : analysis.get(r.id)) ?? null,
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
