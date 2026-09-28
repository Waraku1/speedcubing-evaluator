import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: false,
  outputFileTracingRoot: process.cwd(),
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
