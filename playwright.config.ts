import { defineConfig, devices } from "@playwright/test";

// E2E / interaction + layout checks against the real Vite dev server rendered in
// a real (headless) Chromium. This is the layer the Vitest+jsdom suite cannot
// cover: rendering, layout/overflow, and platform capabilities (see CLAUDE.md
// "Layout bugs are invisible to the unit suite" and ADR-0007).
//
// Specs live in `e2e/` as *.spec.ts so Vitest (scoped to src/**,test/** *.test.ts)
// never picks them up, and vice versa.
export default defineConfig({
  testDir: "./e2e",
  outputDir: ".playwright/test-results",
  reporter: [["html", { outputFolder: ".playwright/report", open: "never" }]],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  // Phone-first PWA: default to a small phone viewport so overflow bugs surface
  // (CLAUDE.md "Responsive & mobile"). Pixel 5 ≈ 393px CSS width, mid-range of the
  // 320–430px phone band; individual specs drop to the ~320px floor to test it.
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
    },
  ],
  // Auto-start the dev server for the run and reuse an already-running one locally.
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
