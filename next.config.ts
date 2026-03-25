import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  serverExternalPackages: ["tesseract.js", "pdf-parse"],
  turbopack: {},
};

export default nextConfig;
