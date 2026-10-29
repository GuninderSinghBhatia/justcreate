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
  ["guardrails", "Do and don't"],
  ["implementation", "Implementation guidance"],
] as const;

export type SpecSectionKey = (typeof SPEC_SECTIONS)[number][0];

/** Same scheme as the worker: shortest uniform hex prefix (min 6) that is unique on the board. */
export function shortIds(ids: string[]): Map<string, string> {
  for (let n = 6; n <= 12; n++) {
    const short = ids.map((id) => id.replaceAll("-", "").slice(0, n));
    if (new Set(short).size === ids.length) return new Map(short.map((s, i) => [s, ids[i]]));
  }
  return new Map(ids.map((id) => [id.replaceAll("-", "").slice(0, 12), id]));
}

/** Where a citation's chip points: `#ref-<short id>`; the preview renders those links as chips. */
export const CITATION_HREF = "#ref-";

/** Turns [ref:abc123] citations into `[abc123](#ref-abc123)` links for known references. */
export function linkCitations(markdown: string, refs: Record<string, unknown>) {
  return markdown.replace(/\[ref:([0-9a-f]{6,12})\]/g, (whole, id: string) => (refs[id] ? `[${id}](${CITATION_HREF}${id})` : whole));
}

/** `## 3. Typography` headings of a design.md, in order, with the section key when it's a known one. */
export function specHeadings(markdown: string) {
  return [...markdown.matchAll(/^## (?:\d+\.\s*)?(.+?)\s*$/gm)].map((m) => {
    const title = m[1];
    return { title, id: slug(title), key: SPEC_SECTIONS.find(([, t]) => t === title)?.[0] ?? null };
  });
}

export function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/^\d+\.\s*/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
