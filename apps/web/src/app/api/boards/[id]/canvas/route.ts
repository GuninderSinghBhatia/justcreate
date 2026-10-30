import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { touchBoard } from "@/lib/boards";
import { requestUser } from "@/lib/request-user";

interface CanvasItem {
  referenceId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

interface CanvasSave {
  /** Excalidraw scene: { type: "excalidraw", elements } (image files are not stored: they're the references). */
  document: { type: "excalidraw"; elements: Record<string, unknown>[] };
  /** Reference images on the canvas, in scene coordinates. */
  items: CanvasItem[];
  /** References this canvas had and the user deleted. Only these leave the board, so a tab that
   *  loaded before a new capture arrived can't remove it. */
  removed: string[];
}

const MAX_BODY = 5 * 1024 * 1024;
const MAX_ELEMENTS = 20_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHUNK = 200; // ids per `in (...)` filter: the list travels in the URL

/**
 * Saves the canvas and keeps board_items in step with the reference images on it: images added on
 * the canvas become board items, images deleted from it are removed from the board. Board items are
 * written first and the document last, so a failed save leaves the previous pair intact.
 */
export async function PUT(request: Request, { params }: RouteContext<"/api/boards/[id]/canvas">) {
  const { id: boardId } = await params;
  const auth = await requestUser(request);
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { supabase, user } = auth;

  if (Number(request.headers.get("content-length")) > MAX_BODY) {
    return NextResponse.json({ error: "This board is too large to save" }, { status: 413 });
  }
  const text = await request.text();
  if (text.length > MAX_BODY) return NextResponse.json({ error: "This board is too large to save" }, { status: 413 });
  const body = parse(text);
  if (!body) return NextResponse.json({ error: "Bad body" }, { status: 400 });

  const { data: board } = await supabase.from("boards").select("id").eq("id", boardId).maybeSingle();
  if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

  // Only the caller's existing references can be placed: an image whose reference was deleted (or
  // someone else's id) is skipped instead of failing every save from now on.
  const wanted = [...new Set(body.items.map((i) => i.referenceId))];
  const [mine, { data: existing, error: existingError }] = await Promise.all([
    ownedReferences(supabase, wanted),
    supabase.from("board_items").select("reference_id").eq("board_id", boardId),
  ]);
  if (!mine || existingError) return failed(existingError?.message ?? "reference lookup failed");
  const items = body.items.filter((i) => mine.has(i.referenceId));
  const before = new Set((existing ?? []).map((i) => i.reference_id));
  const onCanvas = new Set(items.map((i) => i.referenceId));
  const removed = body.removed.filter((id) => before.has(id) && !onCanvas.has(id));

  const [upserted, deleted] = await Promise.all([
    items.length
      ? supabase.from("board_items").upsert(
          items.map((i) => ({ board_id: boardId, reference_id: i.referenceId, user_id: user.id, x: i.x, y: i.y, w: i.w, h: i.h, z: i.z })),
          { onConflict: "board_id,reference_id" },
        )
      : null,
    removed.length ? supabase.from("board_items").delete().eq("board_id", boardId).in("reference_id", removed) : null,
  ]);
  if (upserted?.error) return failed(upserted.error.message);
  if (deleted?.error) return failed(deleted.error.message);

  const { error: boardError } = await supabase
    .from("boards")
    .update({ document: body.document, updated_at: new Date().toISOString() })
    .eq("id", boardId);
  if (boardError) return failed(boardError.message);

  const added = [...onCanvas].filter((id) => !before.has(id)).length;
  if (added) await touchBoard(supabase, user.id, boardId, added);
  return NextResponse.json({ ok: true, added, removed: removed.length, skipped: body.items.length - items.length });
}

/** The body, shape-checked; null when it isn't a canvas save. */
function parse(text: string): CanvasSave | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(raw) || !Array.isArray(raw.items)) return null;
  const doc = raw.document;
  if (!isObject(doc) || doc.type !== "excalidraw" || !Array.isArray(doc.elements) || doc.elements.length > MAX_ELEMENTS) return null;
  if (!doc.elements.every(isObject)) return null;

  const items: CanvasItem[] = [];
  for (const i of raw.items) {
    if (!isObject(i) || typeof i.referenceId !== "string" || !UUID.test(i.referenceId)) return null;
    const [x, y, w, h, z] = [i.x, i.y, i.w, i.h, i.z].map(Number);
    if (![x, y, w, h, z].every(Number.isFinite)) return null;
    items.push({ referenceId: i.referenceId, x, y, w, h, z: Math.round(z) });
  }
  const removed = Array.isArray(raw.removed) ? raw.removed.filter((id): id is string => typeof id === "string" && UUID.test(id)) : [];
  return { document: { type: "excalidraw", elements: (doc.elements as Record<string, unknown>[]).flatMap(cleanElement) }, items, removed };
}

/**
 * Elements as stored: links only to web pages, and no embedded frames (a shared or restored scene
 * mustn't carry a `javascript:` link or an iframe into the app).
 */
function cleanElement(el: Record<string, unknown>): Record<string, unknown>[] {
  if (el.type === "embeddable" || el.type === "iframe") return [];
  if (typeof el.link === "string" && !/^https?:\/\//i.test(el.link)) return [{ ...el, link: null }];
  return [el];
}

async function ownedReferences(supabase: SupabaseClient, ids: string[]) {
  const mine = new Set<string>();
  for (let n = 0; n < ids.length; n += CHUNK) {
    const { data, error } = await supabase.from("references").select("id").in("id", ids.slice(n, n + CHUNK));
    if (error) return null;
    for (const r of data ?? []) mine.add(r.id as string);
  }
  return mine;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function failed(message: string) {
  console.error("Canvas save failed:", message);
  // The database's own message stays in the log: it describes our schema, not the user's mistake.
  return NextResponse.json({ error: "Couldn't save the board" }, { status: 500 });
}
