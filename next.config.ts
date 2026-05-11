import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Increase the server action body size limit to 50MB to support large CSV imports
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
