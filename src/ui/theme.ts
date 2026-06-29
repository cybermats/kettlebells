/**
 * Theme application helper — keeps DOM attribute in sync with ThemePreference.
 *
 * "auto" → removes data-theme so @media (prefers-color-scheme) applies.
 * "light" / "dark" → sets data-theme to override @media.
 */

import type { ThemePreference } from "../domain/types";

export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === "auto") {
    delete root.dataset["theme"];
  } else {
    root.dataset["theme"] = theme;
  }
}
