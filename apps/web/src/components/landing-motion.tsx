"use client";

import { useEffect, useRef, useState } from "react";

const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]";

/** Heavy fade up as the element enters the viewport (IntersectionObserver, never scroll events). */
export function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setShown(true), io.disconnect()), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`transition-all duration-1000 ${EASE} motion-reduce:transition-none ${
        shown ? "translate-y-0 opacity-100 blur-0" : "translate-y-16 opacity-0 blur-md motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:blur-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** Tagline whose words turn from muted to full colour one by one as they cross the middle of the screen. */
export function TaglineReveal({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [lit, setLit] = useState(0);
  const words = lines.flatMap((line, i) => line.split(" ").map((w, j) => ({ w, br: i > 0 && j === 0 })));

  useEffect(() => {
    const spans = [...(ref.current?.querySelectorAll<HTMLElement>("[data-word]") ?? [])];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).dataset.word);
          if (e.isIntersecting) setLit((cur) => Math.max(cur, n + 1));
        }
      },
      { rootMargin: "0px 0px -45% 0px" }, // trigger line just above the middle of the viewport
    );
    spans.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <p ref={ref} className="max-w-170 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
      {words.map(({ w, br }, i) => (
        <span key={i}>
          {br && <br className="hidden sm:inline" />}
          <span
            data-word={i}
            className={`transition-opacity duration-700 ${EASE} ${i < lit ? "opacity-100" : "opacity-30"}`}
          >
            {w}
          </span>{" "}
        </span>
      ))}
    </p>
  );
}
