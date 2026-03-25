import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  serverExternalPackages: ["pdf-parse"],
  webpack(config, { isServer }) {
    if (isServer) {
      // Prevent tesseract.js from being bundled — it does not work in Vercel serverless.
      // The dynamic import in extractor.ts will catch the missing module gracefully.
      config.resolve = {
        ...config.resolve,
        alias: {
          ...config.resolve?.alias,
          "tesseract.js": false,
        },
      };
    }
    return config;
  },
};

export default nextConfig;
