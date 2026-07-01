import { expect, test } from "@playwright/test";

// Demonstrates the two things the jsdom unit suite cannot check: real rendered
// layout, and live interactions driven through the actual DOM/event path.

test("no horizontal overflow at a phone width", async ({ page }) => {
  await page.goto("/");

  // The floor a layout must survive (CLAUDE.md: ~320px). Nothing may extend past
  // the viewport edge / require sideways scrolling.
  await page.setViewportSize({ width: 320, height: 800 });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page scrolls horizontally at 320px").toBeLessThanOrEqual(0);
});

test("start/pause toggle runs the stopwatch and flips its label", async ({ page }) => {
  await page.goto("/");

  const toggle = page.locator(".stopwatch__toggle");
  const clock = page.locator(".stopwatch__time");

  await expect(clock).toHaveText("0:00.0");
  await expect(toggle).toHaveText(/Start/);

  await toggle.click();

  // Interaction outcome: the one button flips to Pause and the clock advances.
  await expect(toggle).toHaveText(/Pause/);
  await expect(clock).not.toHaveText("0:00.0");

  // Clicking again pauses and restores the Start label.
  await toggle.click();
  await expect(toggle).toHaveText(/Start/);
});

test("timer, toggle and reset sit on one row at a phone width", async ({ page }) => {
  await page.goto("/");
  await page.setViewportSize({ width: 320, height: 800 });

  const time = page.locator(".stopwatch__time");
  const toggle = page.locator(".stopwatch__toggle");
  const reset = page.locator(".stopwatch__reset");

  const [t, tog, r] = await Promise.all([
    time.boundingBox(),
    toggle.boundingBox(),
    reset.boundingBox(),
  ]);

  // Vertically overlapping bounding boxes ⇒ same visual row (no wrap).
  const sameRow = (a: typeof t, b: typeof t) =>
    a !== null && b !== null && a.y < b.y + b.height && b.y < a.y + a.height;

  expect(sameRow(t, tog), "timer and toggle are not on the same row").toBe(true);
  expect(sameRow(tog, r), "toggle and reset are not on the same row").toBe(true);
});
