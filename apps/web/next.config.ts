import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@turno/core"],
  // photos are resized in the browser to well under this before upload
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
};

export default config;
