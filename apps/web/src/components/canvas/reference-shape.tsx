"use client";

import { createContext, useContext } from "react";
import { BaseBoxShapeUtil, HTMLContainer, T, type TLShape } from "tldraw";
import type { ReferenceView } from "@/lib/references";

export const REFERENCE_SHAPE = "reference";

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [REFERENCE_SHAPE]: { w: number; h: number; referenceId: string };
  }
}

export type ReferenceShape = TLShape<typeof REFERENCE_SHAPE>;

/**
 * Card data lives outside the tldraw document (signed URLs expire, titles get edited), so cards
 * only store `referenceId` and read the rest from this context.
 */
export const ReferencesContext = createContext<Map<string, ReferenceView>>(new Map());

export class ReferenceShapeUtil extends BaseBoxShapeUtil<ReferenceShape> {
  static override type = REFERENCE_SHAPE;
  static override props = { w: T.number, h: T.number, referenceId: T.string };

  getDefaultProps(): ReferenceShape["props"] {
    return { w: 280, h: 320, referenceId: "" };
  }

  override canEdit() {
    return false;
  }

  component(shape: ReferenceShape) {
    return <ReferenceCardShape shape={shape} />;
  }

  getIndicatorPath(shape: ReferenceShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8);
    return path;
  }
}

const FOOTER = 56;

function ReferenceCardShape({ shape }: { shape: ReferenceShape }) {
  const r = useContext(ReferencesContext).get(shape.props.referenceId);
  const { w, h } = shape.props;
  const text = (r?.metadata as { text?: string } | undefined)?.text;

  return (
    <HTMLContainer
      style={{ width: w, height: h, pointerEvents: "all" }}
      className="overflow-hidden rounded-lg border border-foreground/15 bg-background shadow-sm"
    >
      <div className="relative bg-foreground/5" style={{ height: h - FOOTER }}>
        {r?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs; tldraw culls offscreen cards
          <img
            src={r.imageUrl}
            alt={r.title ?? ""}
            draggable={false}
            loading="lazy"
            className="h-full w-full object-cover object-top"
          />
        ) : text ? (
          <p className="h-full overflow-hidden whitespace-pre-line p-3 text-sm">{text}</p>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-foreground/40">
            {r ? "No preview" : "Loading…"}
          </div>
        )}
        {r?.type === "video" && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/60 px-3 py-2 text-white">▶</span>
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-3 py-2 text-xs" style={{ height: FOOTER }}>
        <span className="flex items-center gap-2">
          <span className="rounded bg-foreground/10 px-1 uppercase tracking-wide">{r?.type ?? "…"}</span>
          {r?.analysis?.palette.slice(0, 5).map((hex) => (
            <span key={hex} className="h-3 w-3 rounded-sm" style={{ background: hex }} />
          ))}
        </span>
        <span className="truncate font-medium">{r?.title ?? ""}</span>
      </div>
    </HTMLContainer>
  );
}
