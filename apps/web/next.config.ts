import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared workspace package ships TypeScript source.
  transpilePackages: ["@justcreate/shared"],
  // No floating Next.js "N" badge over the UI in development.
  devIndicators: false,
  // One board per user now: old multi-board links open it.
  async redirects() {
    return [
      { source: "/boards", destination: "/board", permanent: false },
      { source: "/boards/:id/spec", destination: "/board/spec", permanent: false },
      { source: "/boards/:id", destination: "/board", permanent: false },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
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
