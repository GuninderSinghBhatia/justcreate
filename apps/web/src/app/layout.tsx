import type { Metadata } from "next";
import { Geist_Mono, Nunito } from "next/font/google";
import "./globals.css";

// Nunito everywhere: the app and the landing page.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JustCreate",
  description: "Save references, build moodboards, get a design.md",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${geistMono.variable} h-full antialiased`}
      // data-paper (the canvas colour) is set by the script below, before React hydrates.
      suppressHydrationWarning
    >
      <head>
        {/* The saved canvas colour, applied before first paint so the bar and board never flash
            the default (globals.css: :root[data-paper]). Chosen in the canvas tool strip. */}
        <script dangerouslySetInnerHTML={{ __html: PAPER_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

const PAPER_SCRIPT = `try{var p=localStorage.getItem("justcreate:canvas-paper");if(p)document.documentElement.dataset.paper=p}catch(e){}`;
