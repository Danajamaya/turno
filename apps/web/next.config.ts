import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@turno/core"],
  // photos are resized in the browser; verification sends up to 4 documents of 2 MB
  experimental: { serverActions: { bodySizeLimit: "9mb" } },
};

export default config;
