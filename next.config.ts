import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow uploads of chat exports, PDFs and email batches.
    serverActions: { bodySizeLimit: "20mb" },
  },
  serverExternalPackages: ["mailparser", "unpdf"],
};

export default nextConfig;
