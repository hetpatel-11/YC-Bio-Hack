import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config) {
    // NGL uses dynamic requires for optional binary parsers; suppress warnings
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
    };
    return config;
  },
};

export default nextConfig;
