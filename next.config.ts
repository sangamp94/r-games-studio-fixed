import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["argon2", "sharp", "yauzl"],
  poweredByHeader: false,
};

export default nextConfig;
