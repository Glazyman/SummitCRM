import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unpdf (server-side PDF→Word conversion) bundles its own polyfilled pdfjs;
  // load it from node_modules at runtime so Next doesn't mangle that.
  serverExternalPackages: ['unpdf'],
  experimental: {
    // Increase the server action body size limit to 50MB to support large CSV imports
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
