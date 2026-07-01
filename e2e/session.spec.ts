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

test("start button runs the stopwatch and toggles controls", async ({ page }) => {
  await page.goto("/");

  const start = page.getByRole("button", { name: /Start/ });
  const pause = page.getByRole("button", { name: /Pause/ });
  const clock = page.locator(".stopwatch__time");

  await expect(clock).toHaveText("0:00.0");
  await expect(start).toBeEnabled();
  await expect(pause).toBeDisabled();

  await start.click();

  // Interaction outcome: controls flip and the clock actually advances.
  await expect(start).toBeDisabled();
  await expect(pause).toBeEnabled();
  await expect(clock).not.toHaveText("0:00.0");
});
