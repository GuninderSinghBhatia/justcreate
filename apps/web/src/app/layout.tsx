import type { Metadata } from "next";
import { Geist_Mono, Nunito } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Excalidraw's hand-drawn face (OFL-1.1, see fonts/OFL.txt) for headings and UI labels.
const excalifont = localFont({
  src: "./fonts/Excalifont-Regular.woff2",
  variable: "--font-excalifont",
  display: "swap",
});

// Excalidraw pairs its handwriting with Nunito; it carries long text so it stays readable.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JUSTCREATE",
  description: "Save references, build moodboards, get a design.md",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${excalifont.variable} ${nunito.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
