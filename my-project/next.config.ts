import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    domains: ["images.unsplash.com"], // ✅ Allow Sanity images
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    ppr: "incremental",
    serverActions: {
      bodySizeLimit: "5mb",
    }
  }
};

export default nextConfig;
