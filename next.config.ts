import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright", "playwright-core", "@prisma/client", "@anthropic-ai/claude-agent-sdk", "unpdf"],
};

export default nextConfig;
