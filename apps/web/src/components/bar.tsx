"use client";

import Link from "next/link";

/**
 * Controls for the top bar, in one size and one voice: 32px tall, body font, lilac "on" tint
 * shared with the canvas tool strip. Segmented switches, panel toggles, quiet and primary buttons.
 */

const BASE = "bar-ctl inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 font-sans text-[13px] leading-none transition-colors";
const QUIET = `${BASE} text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground disabled:pointer-events-none disabled:opacity-40`;
const PRIMARY = `${BASE} bg-foreground font-semibold text-background hover:bg-foreground/85 disabled:opacity-40`;

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex h-8 shrink-0 items-center gap-0.5 rounded-lg bg-foreground/[0.06] p-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={`bar-ctl inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 font-sans text-[13px] leading-none transition-colors ${
              on ? "bg-(--strip-bg) text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-foreground/60 hover:text-foreground"
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function BarToggle({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={on ? `${BASE} bg-(--strip-on) text-(--strip-on-text)` : QUIET}
    >
      {icon}
      {children}
    </button>
  );
}

export function BarButton({
  primary,
  icon,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; icon?: React.ReactNode }) {
  return (
    <button type="button" {...props} className={`${primary ? PRIMARY : QUIET} ${props.className ?? ""}`}>
      {icon}
      {children}
    </button>
  );
}

export function BarLink({ href, primary, icon, children }: { href: string; primary?: boolean; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} className={primary ? PRIMARY : QUIET}>
      {icon}
      {children}
    </Link>
  );
}

export function BarDivider() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-foreground/10" />;
}

/** "Saved" with a status dot; fixed width so the bar doesn't shift as it changes. */
export function SaveStatus({ state }: { state: "saved" | "saving" | "error" }) {
  const dot = state === "error" ? "bg-red-500" : state === "saving" ? "bg-amber-500 spec-pulse" : "bg-emerald-500";
  return (
    <span aria-live="polite" className="hidden shrink-0 items-center gap-1.5 font-sans text-xs text-foreground/50 md:inline-flex">
      <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />
      {state === "saving" ? "Saving…" : state === "error" ? "Not saved" : "Saved"}
    </span>
  );
}

/** 16px line icons for the bar. */
export const BarIcon = {
  canvas: (
    <Svg>
      <path d="M2.5 3.5h11v9h-11z" />
      <path d="M5 10l2.2-2.4 1.8 1.6L11 7" />
    </Svg>
  ),
  grid: (
    <Svg>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
    </Svg>
  ),
  references: (
    <Svg>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M6.5 2.5v11" />
    </Svg>
  ),
  clusters: (
    <Svg>
      <circle cx="5.5" cy="6" r="2.5" />
      <circle cx="10.5" cy="6" r="2.5" />
      <circle cx="8" cy="10.5" r="2.5" />
    </Svg>
  ),
  doc: (
    <Svg>
      <path d="M4 2h5.5L12.5 5v9h-8.5z" />
      <path d="M9.5 2v3h3M6 8h4.5M6 10.5h4.5" />
    </Svg>
  ),
  copy: (
    <Svg>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V3.5a1 1 0 00-1-1h-6a1 1 0 00-1 1v6a1 1 0 001 1h2" />
    </Svg>
  ),
  download: (
    <Svg>
      <path d="M8 2.5v7.5M5 7.5l3 3 3-3M3 13.5h10" />
    </Svg>
  ),
  back: (
    <Svg>
      <path d="M10 3.5L5.5 8l4.5 4.5" />
    </Svg>
  ),
  sparkle: (
    <Svg>
      <path d="M8 2.5l1.3 3.2 3.2 1.3-3.2 1.3L8 11.5 6.7 8.3 3.5 7l3.2-1.3z" />
      <path d="M12.5 11v3M11 12.5h3" />
    </Svg>
  ),
};

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

/** A dropdown in the bar's tinted track style (same fill as the segmented switch). */
export function BarSelect({
  strong,
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { strong?: boolean }) {
  return (
    <span className={`relative inline-flex h-8 min-w-0 items-center ${className}`}>
      <select
        {...props}
        className={`bar-ctl h-8 w-full min-w-0 appearance-none truncate rounded-lg bg-foreground/[0.06] py-0 pr-7 pl-2.5 font-sans text-[13px] hover:bg-foreground/10 ${
          strong ? "font-semibold text-foreground" : "text-foreground/70"
        }`}
      >
        {children}
      </select>
      <svg viewBox="0 0 10 10" className="pointer-events-none absolute right-2.5 size-2.5 opacity-50" fill="currentColor" aria-hidden>
        <path d="M1.5 3.5h7L5 7.5z" />
      </svg>
    </span>
  );
}
