import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared workspace package ships TypeScript source.
  transpilePackages: ["@justcreate/shared"],
  // No floating Next.js "N" badge over the UI in development.
  devIndicators: false,
  poweredByHeader: false,
  // No other site may frame the app (clickjacking), sniff uploads into another type, or see full URLs we link to.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
            : []),
        ],
      },
    ];
  },
  // One board per user now: old multi-board links open it.
  async redirects() {
    return [
      { source: "/boards", destination: "/board", permanent: false },
      { source: "/library", destination: "/board", permanent: false },
      { source: "/boards/:id/spec", destination: "/board/spec", permanent: false },
      { source: "/boards/:id", destination: "/board", permanent: false },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // The build cache once shipped a stale globals.css (it goes through the Tailwind loader below);
    // production builds compile from scratch instead. Dev keeps its cache.
    turbopackFileSystemCacheForBuild: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
