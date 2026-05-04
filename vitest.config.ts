import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "istanbul",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "./coverage",
      include: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}", "convex/**/*.ts"],
      exclude: [
        "convex/_generated/**",
        "convex/README.md",
        "**/*.d.ts",
        "**/*.config.{ts,js,mts,cts}",
      ],
    },
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      {
        find: /^convex\/_generated\/(.*)$/,
        replacement: path.resolve(__dirname, "./convex/_generated/$1"),
      },
      {
        find: /^convex\/lib\/(.*)$/,
        replacement: path.resolve(__dirname, "./convex/lib/$1"),
      },
    ],
  },
});
