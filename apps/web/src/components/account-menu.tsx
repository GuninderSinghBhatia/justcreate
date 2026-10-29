"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/** Extension, Settings and Sign out behind one small button, for the compact top bar. */
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const item = "block w-full rounded px-3 py-1.5 text-left hover:bg-foreground/5";
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`bar-ctl grid size-8 shrink-0 place-items-center rounded-full transition-colors ${open ? "bg-(--strip-on) text-(--strip-on-text)" : "bg-foreground/[0.06] text-foreground/70 hover:bg-foreground/10 hover:text-foreground"}`}
      >
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
          <circle cx="8" cy="5.5" r="2.6" />
          <path d="M2.8 13.8c.8-2.6 2.8-3.9 5.2-3.9s4.4 1.3 5.2 3.9" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="animate-fade absolute top-full right-0 z-50 mt-2 w-44 rounded-lg border border-foreground/15 bg-background p-1 text-sm shadow-lg">
          <Link role="menuitem" href="/connect" className={item} onClick={() => setOpen(false)}>
            Extension
          </Link>
          <Link role="menuitem" href="/settings" className={item} onClick={() => setOpen(false)}>
            Settings
          </Link>
          <div className="my-1 h-px bg-foreground/10" />
          <form action="/auth/signout" method="post">
            <button role="menuitem" className={`${item} font-sans text-foreground/60 hover:text-foreground`}>
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
