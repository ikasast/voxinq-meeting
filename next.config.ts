import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Every request passes through proxy.ts, and Next buffers at most 10 MB of a body for a
    // proxied request by default — enough for anything else the app does, but a backup upload
    // is the whole instance, recordings included, and would silently arrive truncated.
    // Restoring is a deliberate, local, single-user action, so the cap is simply lifted rather
    // than set to a number that will be wrong again later.
    proxyClientMaxBodySize: Infinity,
  },
};

export default nextConfig;
