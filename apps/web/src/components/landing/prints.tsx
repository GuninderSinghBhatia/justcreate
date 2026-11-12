/**
 * The references pinned on the landing board: small made-up web designs, drawn in code so they
 * scale with their print (sizes in cqw). Colours are exact: the design.md sheet on the page quotes
 * them and cites the print it measured them from.
 */

export type PrintId = "nightline" | "pulse" | "signal" | "kiln" | "zine" | "poster" | "folio" | "transit" | "ledger";

export const PRINTS: Record<PrintId, { title: string; kind: string; ref: string; ar: string }> = {
  nightline: { title: "Analytics dashboard", kind: "screenshot", ref: "a91f2c", ar: "16 / 10" },
  pulse: { title: "Ops console", kind: "image", ref: "3be07d", ar: "4 / 5" },
  signal: { title: "Chart detail", kind: "region", ref: "c41b88", ar: "1 / 1" },
  kiln: { title: "Bakery landing", kind: "page", ref: "5d02e1", ar: "4 / 3" },
  zine: { title: "Magazine spread", kind: "image", ref: "e7a410", ar: "3 / 4" },
  poster: { title: "Exhibition poster", kind: "image", ref: "0b9f6d", ar: "3 / 4" },
  folio: { title: "Portfolio index", kind: "page", ref: "f15c3a", ar: "4 / 3" },
  transit: { title: "Wayfinding sign", kind: "image", ref: "98d2b7", ar: "1 / 1" },
  ledger: { title: "Banking app", kind: "screenshot", ref: "2c6e90", ar: "4 / 5" },
};

export function Shot({ id }: { id: PrintId }) {
  switch (id) {
    case "nightline":
      return <Nightline />;
    case "pulse":
      return <Pulse />;
    case "signal":
      return <Signal />;
    case "kiln":
      return <Kiln />;
    case "zine":
      return <Zine />;
    case "poster":
      return <Poster />;
    case "folio":
      return <Folio />;
    case "transit":
      return <Transit />;
    case "ledger":
      return <Ledger />;
  }
}

const fill = { position: "absolute", inset: 0 } as const;

/** Dark analytics app: #0F0F1A ground, #2E283D sidebar and tiles, pink line, cyan bars. */
function Nightline() {
  return (
    <div style={{ ...fill, background: "#0F0F1A", display: "grid", gridTemplateColumns: "20cqw 1fr", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ background: "#2E283D", padding: "4cqw 3cqw", display: "flex", flexDirection: "column", gap: "2.4cqw" }}>
        <div style={{ width: "7cqw", height: "7cqw", borderRadius: "2cqw", background: "#FF2D9A" }} />
        {[70, 90, 55, 80].map((w) => (
          <div key={w} style={{ height: "1.6cqw", width: `${w}%`, borderRadius: "1cqw", background: "rgb(255 255 255 / 0.18)" }} />
        ))}
      </div>
      <div style={{ padding: "4cqw", display: "flex", flexDirection: "column", gap: "3cqw" }}>
        <div style={{ color: "#ECEAF4", fontWeight: 650, fontSize: "4.6cqw", letterSpacing: "-0.02em" }}>Nightline</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "2cqw" }}>
          {["#FF2D9A", "#00E5FF", "#ECEAF4"].map((c) => (
            <div key={c} style={{ background: "#2E283D", borderRadius: "1.6cqw", padding: "2cqw", border: "1px solid rgb(255 255 255 / 0.06)" }}>
              <div style={{ height: "1.2cqw", width: "50%", background: "rgb(255 255 255 / 0.25)", borderRadius: "1cqw" }} />
              <div style={{ height: "3.2cqw", width: "70%", marginTop: "1.6cqw", background: c, borderRadius: "1cqw" }} />
            </div>
          ))}
        </div>
        <svg viewBox="0 0 100 34" preserveAspectRatio="none" style={{ flex: 1, width: "100%" }}>
          {[6, 14, 10, 20, 16, 24, 18, 27].map((h, i) => (
            <rect key={i} x={i * 12.5 + 2} y={34 - h} width="6" height={h} fill="#00E5FF" opacity="0.35" />
          ))}
          <polyline points="0,26 12,22 25,24 37,13 50,16 62,8 75,11 87,4 100,6" fill="none" stroke="#FF2D9A" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </div>
  );
}

/** Dark console list: pink status dots, cyan values. */
function Pulse() {
  return (
    <div style={{ ...fill, background: "#0F0F1A", padding: "7cqw 6cqw", display: "flex", flexDirection: "column", gap: "4cqw", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ color: "#ECEAF4", fontWeight: 650, fontSize: "7cqw", letterSpacing: "-0.02em" }}>Pulse</div>
      <div style={{ display: "flex", gap: "2cqw" }}>
        {["Live", "Queued", "Done"].map((t, i) => (
          <span key={t} style={{ fontSize: "3.6cqw", padding: "1cqw 3cqw", borderRadius: "99px", background: i === 0 ? "#FF2D9A" : "#2E283D", color: i === 0 ? "#0F0F1A" : "#B9B4CC", fontWeight: 700 }}>
            {t}
          </span>
        ))}
      </div>
      {[0.92, 0.64, 0.81, 0.4, 0.73].map((v, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "3cqw 1fr auto", alignItems: "center", gap: "3cqw", padding: "3cqw", borderRadius: "3cqw", background: "#2E283D", border: "1px solid rgb(255 255 255 / 0.06)" }}>
          <span style={{ width: "3cqw", height: "3cqw", borderRadius: "50%", background: i % 2 ? "#00E5FF" : "#FF2D9A" }} />
          <span style={{ height: "2cqw", width: `${v * 100}%`, borderRadius: "1cqw", background: "rgb(255 255 255 / 0.2)" }} />
          <span style={{ color: "#00E5FF", fontSize: "3.6cqw", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{Math.round(v * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

/** A crop of a chart: area on #2E283D surface. */
function Signal() {
  return (
    <div style={{ ...fill, background: "#2E283D" }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
        {[20, 40, 60, 80].map((y) => (
          <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="rgb(255 255 255 / 0.08)" strokeWidth="0.6" />
        ))}
        <path d="M0,78 C14,70 20,52 34,56 S54,30 66,36 S86,14 100,18 L100,100 L0,100 Z" fill="#00E5FF" opacity="0.22" />
        <path d="M0,78 C14,70 20,52 34,56 S54,30 66,36 S86,14 100,18" fill="none" stroke="#00E5FF" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <circle cx="66" cy="36" r="3.2" fill="#FF2D9A" />
      </svg>
    </div>
  );
}

/** Warm bakery landing: oat ground, brick button, a scored loaf. */
function Kiln() {
  return (
    <div style={{ ...fill, background: "#F4E9D8", padding: "6cqw", display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "4cqw", alignItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "3cqw" }}>
        <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", color: "#3B2416", fontSize: "7.6cqw", lineHeight: 1, letterSpacing: "-0.01em" }}>
          Slow bread, early mornings.
        </div>
        <div style={{ height: "1.4cqw", width: "80%", background: "rgb(59 36 22 / 0.25)", borderRadius: "1cqw" }} />
        <div style={{ height: "1.4cqw", width: "60%", background: "rgb(59 36 22 / 0.25)", borderRadius: "1cqw" }} />
        <span style={{ alignSelf: "start", marginTop: "1cqw", background: "#C8553D", color: "#FFF7EC", fontFamily: "Georgia, serif", fontSize: "3.4cqw", padding: "1.6cqw 3.6cqw", borderRadius: "99px" }}>
          Order for Saturday
        </span>
      </div>
      <svg viewBox="0 0 100 80" style={{ width: "100%" }}>
        <ellipse cx="50" cy="44" rx="44" ry="28" fill="#C98B4E" />
        <ellipse cx="50" cy="40" rx="40" ry="22" fill="#D9A066" />
        {[30, 46, 62].map((x) => (
          <path key={x} d={`M${x},30 q8,8 4,20`} stroke="#F4E2C4" strokeWidth="3" fill="none" strokeLinecap="round" />
        ))}
      </svg>
    </div>
  );
}

/** Editorial spread: peach page, italic serif headline, two columns. */
function Zine() {
  return (
    <div style={{ ...fill, background: "#F7DCCB", padding: "7cqw", display: "flex", flexDirection: "column", gap: "4cqw" }}>
      <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: "11cqw", lineHeight: 0.95, color: "#5A1F2B" }}>The quiet issue</div>
      <div style={{ height: "0.6cqw", background: "#5A1F2B" }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4cqw", flex: 1 }}>
        {[0, 1].map((c) => (
          <div key={c} style={{ display: "flex", flexDirection: "column", gap: "2.2cqw" }}>
            {[96, 88, 92, 70, 94, 84, 90, 60].map((w, i) => (
              <div key={i} style={{ height: "1.6cqw", width: `${w}%`, background: "rgb(90 31 43 / 0.3)", borderRadius: "1cqw" }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Swiss exhibition poster: red disc, heavy grotesk, a strict grid. */
function Poster() {
  return (
    <div style={{ ...fill, background: "#F2F0EA", padding: "6cqw", fontFamily: "Helvetica, Arial, sans-serif" }}>
      <div style={{ position: "absolute", width: "62cqw", height: "62cqw", borderRadius: "50%", background: "#E2231A", right: "-12cqw", top: "16cqw" }} />
      <div style={{ position: "relative", fontWeight: 800, fontSize: "21cqw", lineHeight: 0.85, letterSpacing: "-0.05em", color: "#111" }}>
        Form
        <br />
        und
        <br />
        Raster
      </div>
      <div style={{ position: "absolute", left: "6cqw", right: "6cqw", bottom: "6cqw", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "3cqw", fontSize: "3.4cqw", fontWeight: 700, color: "#111" }}>
        <span>12.03</span>
        <span>—</span>
        <span>28.06</span>
      </div>
    </div>
  );
}

/** Monochrome portfolio index: giant year range, hairline list. */
function Folio() {
  return (
    <div style={{ ...fill, background: "#FFFFFF", padding: "5cqw", fontFamily: "Helvetica, Arial, sans-serif", color: "#0A0A0A" }}>
      <div style={{ fontWeight: 800, fontSize: "14cqw", lineHeight: 0.9, letterSpacing: "-0.05em" }}>Works 19—26</div>
      <div style={{ marginTop: "4cqw", display: "flex", flexDirection: "column" }}>
        {["Identity", "Type", "Motion", "Print"].map((t, i) => (
          <div key={t} style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #0A0A0A", padding: "1.6cqw 0", fontSize: "3.6cqw", fontWeight: 600 }}>
            <span>{t}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>0{i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Wayfinding sign: signal yellow, black arrow, heavy grotesk. */
function Transit() {
  return (
    <div style={{ ...fill, background: "#FFD200", padding: "8cqw", display: "flex", flexDirection: "column", justifyContent: "space-between", fontFamily: "Helvetica, Arial, sans-serif", color: "#111" }}>
      <svg viewBox="0 0 24 24" style={{ width: "34cqw" }} aria-hidden>
        <path d="M4 20 L20 4 M9 4 H20 V15" fill="none" stroke="#111" strokeWidth="3.2" strokeLinecap="square" />
      </svg>
      <div style={{ fontWeight: 800, fontSize: "15cqw", lineHeight: 0.9, letterSpacing: "-0.04em" }}>Gleis 7</div>
    </div>
  );
}

/** Banking app: pale mint ground, deep green card, tabular figures. */
function Ledger() {
  return (
    <div style={{ ...fill, background: "#EAF4EE", padding: "7cqw", display: "flex", flexDirection: "column", gap: "5cqw", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ background: "#1F3D33", borderRadius: "5cqw", padding: "6cqw", color: "#EAF4EE", display: "flex", flexDirection: "column", gap: "3cqw" }}>
        <span style={{ fontSize: "4cqw", opacity: 0.7 }}>Balance</span>
        <span style={{ fontSize: "11cqw", fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>4,280.16</span>
        <span style={{ alignSelf: "start", fontSize: "3.6cqw", fontWeight: 700, background: "#4CC38A", color: "#0E241C", borderRadius: "99px", padding: "1cqw 3cqw" }}>+2.4%</span>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ height: "2cqw", width: `${40 + i * 10}%`, background: "rgb(31 61 51 / 0.25)", borderRadius: "1cqw" }} />
          <span style={{ height: "2cqw", width: "16%", background: "#4CC38A", borderRadius: "1cqw" }} />
        </div>
      ))}
    </div>
  );
}
