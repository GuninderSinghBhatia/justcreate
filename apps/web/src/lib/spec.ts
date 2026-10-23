/** design.md sections, in document order. Keys match the worker (apps/worker/worker/spec.py). */
export const SPEC_SECTIONS = [
  ["direction", "Overall design direction"],
  ["palette", "Color palette"],
  ["typography", "Typography"],
  ["layout", "Layout and composition"],
  ["components", "UI components"],
  ["effects", "Visual effects"],
  ["motion", "Animations and interactions"],
  ["responsive", "Responsive design"],
  ["implementation", "Implementation guidance"],
] as const;

/** Same scheme as the worker: shortest uniform hex prefix (min 6) that is unique on the board. */
export function shortIds(ids: string[]): Map<string, string> {
  for (let n = 6; n <= 12; n++) {
    const short = ids.map((id) => id.replaceAll("-", "").slice(0, n));
    if (new Set(short).size === ids.length) return new Map(short.map((s, i) => [s, ids[i]]));
  }
  return new Map(ids.map((id) => [id.replaceAll("-", "").slice(0, 12), id]));
}

/** Turns [ref:abc123] citations into markdown links to the reference's source. */
export function linkCitations(markdown: string, refs: Record<string, { title: string; url: string | null }>) {
  return markdown.replace(/\[ref:([0-9a-f]{6,12})\]/g, (whole, id: string) => {
    const ref = refs[id];
    if (!ref) return whole;
    const title = ref.title.replaceAll('"', "'");
    return ref.url ? `[↗${id}](${ref.url} "${title}")` : `\`${id}\``;
  });
}
