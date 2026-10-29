import type { Metadata } from "next";
import { Geist_Mono, Kalam, Nunito } from "next/font/google";
import "./globals.css";

// Kalam, a felt-tip handwriting (OFL-1.1), for headings and UI labels: notes pinned to a moodboard.
const kalam = Kalam({
  variable: "--font-kalam",
  weight: ["400", "700"],
  subsets: ["latin"],
});

// Nunito carries long text so it stays readable.
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
      className={`${kalam.variable} ${nunito.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
