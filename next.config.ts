import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist (used server-side for PDF→Word conversion) ships ESM that
  // bundles poorly — load it from node_modules at runtime instead.
  serverExternalPackages: ['pdfjs-dist'],
  experimental: {
    // Increase the server action body size limit to 50MB to support large CSV imports
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
