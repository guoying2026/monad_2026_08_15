import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import type { NextConfig } from "next";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv({ path: resolve(process.cwd(), ".env.local") });

const nextConfig: NextConfig = {
  transpilePackages: ["@pulse/shared"],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
    NEXT_PUBLIC_MONAD_NETWORK: process.env.NEXT_PUBLIC_MONAD_NETWORK || "testnet",
    NEXT_PUBLIC_AGENT_ID: process.env.NEXT_PUBLIC_AGENT_ID || process.env.AGENT_ID || "",
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/svm": false,
      "@x402/svm/exact/client": false,
    };
    return config;
  },
};

export default nextConfig;
