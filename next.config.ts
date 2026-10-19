import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Solo desarrollo: permite abrir el servidor local desde el celular en la red Wi-Fi.
  allowedDevOrigins: ["192.168.68.51"],
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
