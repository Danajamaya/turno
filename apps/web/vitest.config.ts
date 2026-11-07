import path from "node:path";
import { defineConfig } from "vitest/config";

// Integration tests run against a real Postgres: set TEST_DATABASE_URL.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "test/server-only-stub.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      STRIPE_SECRET_KEY: "sk_test_dummy",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      STRIPE_PRICE_ESSENTIALS: "price_essentials",
      STRIPE_PRICE_PLUS: "price_plus",
      APP_URL: "http://localhost:3100",
    },
  },
});
