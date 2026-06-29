/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// Static, no-backend build (ADR-0002). Relative base so the built `dist/` works
// when served from any path (GitHub Pages project sites, sub-folders, file://-ish hosts).
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    outDir: "dist",
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    passWithNoTests: true,
  },
});
