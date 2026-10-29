"use client";

import { useEffect, useRef, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/**
 * The board's tool bar: a small vertical strip with the few tools a moodboard needs, and the rest
 * one click away. Shapes and lines are groups: the button takes the last one used and pops out
 * the others to switch to. Excalidraw's own tool bar is hidden (globals.css) but stays mounted:
 * built-in tools are switched by clicking its inputs, so they behave exactly as Excalidraw's
 * (the image tool opens the file picker, the lock keeps a tool active, shortcuts stay in sync).
 */

type Tool =
  | "selection" | "rectangle" | "diamond" | "ellipse" | "arrow" | "line" | "freedraw" | "text"
  | "hand" | "image" | "eraser" | "frame" | "embeddable" | "laser";

/** Canvas colours (globals.css: .board-canvas[data-paper]); sage is the default. */
export const PAPERS = [
  { key: "sage", name: "Sage", swatch: "#e3e9dd" },
  { key: "slate", name: "Slate", swatch: "#e2e7ee" },
  { key: "blush", name: "Blush", swatch: "#f1e3e0" },
  { key: "paper", name: "Paper", swatch: "#f5efe3" },
] as const;
export type Paper = (typeof PAPERS)[number]["key"];

export interface ActiveTool {
  type: string;
  locked: boolean;
}

const LABELS: Record<Tool, string> = {
  selection: "Select", rectangle: "Rectangle", diamond: "Diamond", ellipse: "Ellipse", arrow: "Arrow",
  line: "Line", freedraw: "Pen", text: "Text", hand: "Hand (pan)", image: "Image", eraser: "Eraser",
  frame: "Frame", embeddable: "Web embed", laser: "Laser pointer",
};
const KEYS: Partial<Record<Tool, string>> = {
  selection: "V", rectangle: "R", diamond: "D", ellipse: "O", arrow: "A", line: "L", freedraw: "P",
  text: "T", hand: "H", image: "9", eraser: "E", frame: "F", laser: "K",
};
const SHAPES: Tool[] = ["rectangle", "diamond", "ellipse"];
const LINES: Tool[] = ["arrow", "line"];
const MORE: Tool[] = ["hand", "image", "eraser", "frame", "embeddable", "laser"];
/** Tools on Excalidraw's own (hidden) bar; the rest are set through the API. */
const BUILT_IN = new Set<Tool>(["selection", "rectangle", "diamond", "ellipse", "arrow", "line", "freedraw", "text", "hand", "image", "eraser"]);

export function ToolStrip({
  api,
  active,
  paper,
  onPaper,
}: {
  api: ExcalidrawImperativeAPI | null;
  active: ActiveTool;
  paper: Paper;
  onPaper: (paper: Paper) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<"shapes" | "lines" | "more" | null>(null);
  const [shape, setShape] = useState<Tool>("rectangle");
  const [line, setLine] = useState<Tool>("arrow");

  // The group buttons show whichever member was used last, from here or by shortcut.
  const current = active.type as Tool;
  if (SHAPES.includes(current) && current !== shape) setShape(current);
  if (LINES.includes(current) && current !== line) setLine(current);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const pick = (tool: Tool) => {
    setOpen(null);
    if (!api) return;
    const input = BUILT_IN.has(tool)
      ? root.current?.closest(".board-canvas")?.querySelector<HTMLInputElement>(`.App-toolbar input[data-testid="toolbar-${tool}"]`)
      : null;
    if (input) input.click();
    else api.setActiveTool({ type: tool as "frame" | "embeddable" | "laser" });
  };
  const toggleLock = () => {
    root.current?.closest(".board-canvas")?.querySelector<HTMLInputElement>('.App-toolbar input[data-testid="toolbar-lock"]')?.click();
  };

  const group = (name: "shapes" | "lines", members: Tool[], last: Tool) => {
    const on = members.includes(current);
    return (
      <div className="relative">
        <StripButton
          label={`${LABELS[last]} (${KEYS[last]}), or pick another of the ${name}`}
          on={on}
          more
          onClick={() => {
            // Takes the last-used tool and shows the others to switch to; a second click hides them.
            if (open === name) return setOpen(null);
            pick(last);
            setOpen(name);
          }}
        >
          <Icon tool={last} />
        </StripButton>
        {open === name && (
          <Flyout>
            {members.map((t) => (
              <FlyoutItem key={t} tool={t} on={current === t} onClick={() => pick(t)} />
            ))}
          </Flyout>
        )}
      </div>
    );
  };

  return (
    <div ref={root} className="tool-strip absolute top-4 left-4 z-5 flex flex-col gap-0.5 rounded-lg p-1">
      <StripButton label="Select (V)" on={current === "selection"} onClick={() => pick("selection")}>
        <Icon tool="selection" />
      </StripButton>
      {group("shapes", SHAPES, shape)}
      {group("lines", LINES, line)}
      <StripButton label="Pen (P)" on={current === "freedraw"} onClick={() => pick("freedraw")}>
        <Icon tool="freedraw" />
      </StripButton>
      <StripButton label="Text (T)" on={current === "text"} onClick={() => pick("text")}>
        <Icon tool="text" />
      </StripButton>
      <div className="mx-auto my-0.5 h-px w-4 bg-current opacity-15" />
      <div className="relative">
        <StripButton label="More tools" on={MORE.includes(current)} onClick={() => setOpen(open === "more" ? null : "more")}>
          {MORE.includes(current) ? <Icon tool={current} /> : <Dots />}
        </StripButton>
        {open === "more" && (
          <Flyout wide>
            {MORE.map((t) => (
              <FlyoutItem key={t} tool={t} on={current === t} onClick={() => pick(t)} labelled />
            ))}
            <div className="my-1 h-px bg-current opacity-10" />
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={active.locked}
              onClick={toggleLock}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-(--strip-hover)"
            >
              <span className={`grid size-3.5 place-items-center rounded-sm border ${active.locked ? "bg-current" : ""}`} />
              Keep tool active
            </button>
            <div className="my-1 h-px bg-current opacity-10" />
            <div role="radiogroup" aria-label="Canvas colour" className="flex items-center gap-2 px-2 py-1.5 text-xs">
              <span className="flex-1">Canvas</span>
              {PAPERS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  role="radio"
                  aria-checked={paper === p.key}
                  aria-label={p.name}
                  title={p.name}
                  onClick={() => onPaper(p.key)}
                  className={`size-5 rounded-full border border-black/15 ${paper === p.key ? "ring-2 ring-current ring-offset-1 ring-offset-(--strip-bg)" : "hover:scale-110"}`}
                  style={{ background: p.swatch }}
                />
              ))}
            </div>
          </Flyout>
        )}
      </div>
    </div>
  );
}

function StripButton({ label, on, more, onClick, children }: { label: string; on: boolean; more?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={`relative grid size-7 place-items-center rounded-md ${on ? "bg-(--strip-on) text-(--strip-on-text)" : "hover:bg-(--strip-hover)"}`}
    >
      {children}
      {/* A corner tick marks the buttons that hold a group. */}
      {more && <span aria-hidden className="absolute right-0.5 bottom-0.5 size-1 border-r border-b border-current opacity-50" />}
    </button>
  );
}

function Flyout({ wide, children }: { wide?: boolean; children: React.ReactNode }) {
  return (
    <div role="menu" className={`tool-strip animate-panel-left absolute top-0 left-full ml-2 flex rounded-lg p-1 ${wide ? "w-44 flex-col *:font-sans" : "gap-0.5"}`}>
      {children}
    </div>
  );
}

function FlyoutItem({ tool, on, labelled, onClick }: { tool: Tool; on: boolean; labelled?: boolean; onClick: () => void }) {
  const label = KEYS[tool] ? `${LABELS[tool]} (${KEYS[tool]})` : LABELS[tool];
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={on}
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md text-xs ${labelled ? "w-full px-2 py-1.5 text-left" : "size-7 justify-center"} ${
        on ? "bg-(--strip-on) text-(--strip-on-text)" : "hover:bg-(--strip-hover)"
      }`}
    >
      <Icon tool={tool} />
      {labelled && (
        <>
          <span className="flex-1">{LABELS[tool]}</span>
          {KEYS[tool] && <span className="opacity-40">{KEYS[tool]}</span>}
        </>
      )}
    </button>
  );
}

function Dots() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
      <circle cx="3.5" cy="8" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="12.5" cy="8" r="1.3" />
    </svg>
  );
}

/** Line icons in one 16px grid, round caps like a pen stroke. */
function Icon({ tool }: { tool: Tool }) {
  const paths: Record<Tool, React.ReactNode> = {
    selection: <path d="M4 2.5l8 5.2-3.6.8 2.2 4-1.5.8-2.2-4L4 12z" />,
    rectangle: <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" />,
    diamond: <path d="M8 2l6 6-6 6-6-6z" />,
    ellipse: <ellipse cx="8" cy="8" rx="5.8" ry="4.8" />,
    arrow: <path d="M2.5 13.5L13 3M13 3H7.5M13 3v5.5" />,
    line: <path d="M2.5 13.5L13.5 2.5" />,
    freedraw: <path d="M10.5 2.8l2.7 2.7-7.4 7.4-3.3.6.6-3.3zM9 4.3l2.7 2.7" />,
    text: <path d="M3 4V2.8h10V4M8 2.8v10.4M6 13.2h4" />,
    hand: <path d="M5.5 8V4a1 1 0 012 0v3.5M7.5 7V3a1 1 0 012 0v4M9.5 7.2V4a1 1 0 012 0v5.5a4 4 0 01-4 4h-.6a4 4 0 01-3.2-1.6L2.4 9.4a1 1 0 011.5-1.3L5.5 9.6" />,
    image: <><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><circle cx="6" cy="6.5" r="1.1" /><path d="M2.8 11.5l3.4-3.2 2.6 2.4 1.8-1.6 2.7 2.4" /></>,
    eraser: <path d="M6 13.5h7.5M3.3 10.2l6-6a1.4 1.4 0 012 0l1.6 1.6a1.4 1.4 0 010 2L8 12.7a2.5 2.5 0 01-3.5 0l-1.2-1.2a.9.9 0 010-1.3zM6.2 7.3l3.6 3.6" />,
    frame: <path d="M5 2v12M11 2v12M2 5h12M2 11h12" />,
    embeddable: <path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5" />,
    laser: <><circle cx="11.5" cy="4.5" r="1.6" /><path d="M10.2 5.8L3 13M9 3.2l-.8-.8M13.5 7.3l.8.8M12.8 2.2l.7-.7" /></>,
  };
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[tool]}
    </svg>
  );
}
