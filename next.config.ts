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
    // Client Router Cache: keep a visited page's rendered data in the client for
    // a short window so back/forward + quick revisits are instant instead of
    // re-rendering on the server. `dynamic` covers our force-dynamic pages
    // (leads/pipeline/call-mode); data can be up to this many seconds stale on
    // revisit — a deliberate trade for snappy navigation on an internal tool.
    staleTimes: {
      dynamic: 30,
      static:  180,
    },
  },
};

export default nextConfig;
