/**
 * App shell — top-level render function.
 *
 * Renders the sticky header, bottom tab bar, and delegates to the active
 * view's render function. On view change the previous view's cleanup is
 * called before mounting the next one.
 *
 * Usage:
 *   const { mount, unmount } = createApp(store, document.getElementById("app")!);
 *   mount();
 *   // On teardown: unmount();
 */

import type { Store, ViewName } from "../state/index";
import { setView } from "../state/index";
import { renderSession } from "./session";
import { renderHistory } from "./history";
import { renderSettings } from "./settings";
import { el, clear } from "./dom";

// Nav item definitions
interface NavItem {
  view: ViewName;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { view: "session", label: "Session", icon: "🏋️" },
  { view: "history", label: "History", icon: "📋" },
  { view: "settings", label: "Settings", icon: "⚙️" },
];

// ─── App shell ────────────────────────────────────────────────────────────────

export function createApp(store: Store, root: HTMLElement): { mount: () => void; unmount: () => void } {
  // Build shell DOM once
  const header = el("header", { class: "app-header" });
  const headerTitle = el("span", { class: "app-header__title" }, ["Kettlebells"]);
  header.appendChild(headerTitle);

  const nav = el("nav", { class: "app-nav", "aria-label": "Main navigation" });
  const navBtns: Map<ViewName, HTMLButtonElement> = new Map();

  for (const item of NAV_ITEMS) {
    const btn = el("button", {
      class: "app-nav__btn",
      type: "button",
      "aria-label": item.label,
    });
    const icon = el("span", { class: "app-nav__icon", "aria-hidden": "true" }, [item.icon]);
    const label = el("span", {}, [item.label]);
    btn.append(icon, label);
    btn.addEventListener("click", () => {
      store.setState(setView(item.view));
    });
    navBtns.set(item.view, btn);
    nav.appendChild(btn);
  }

  const main = el("main", { class: "app-main", id: "view-container" });

  // Current active cleanup function and the view it belongs to
  let activeCleanup: (() => void) | null = null;
  let activeView: ViewName | null = null;

  function renderView(view: ViewName): void {
    // Only re-render if the view actually changed — prevents destroying
    // in-progress session state when stopwatch or other non-view state updates.
    if (view === activeView) return;

    // Clean up previous view (e.g. cancel session RAF loop)
    if (activeCleanup !== null) {
      activeCleanup();
      activeCleanup = null;
    }
    activeView = view;

    // Update nav aria-current
    for (const [v, btn] of navBtns) {
      if (v === view) {
        btn.setAttribute("aria-current", "page");
      } else {
        btn.removeAttribute("aria-current");
      }
    }

    // Mount new view
    switch (view) {
      case "session":
        activeCleanup = renderSession(main, store);
        break;
      case "history":
        activeCleanup = renderHistory(main, store);
        break;
      case "settings":
        activeCleanup = renderSettings(main, store);
        break;
    }
  }

  function mount(): void {
    clear(root);
    root.append(header, main, nav);

    // Initial render
    renderView(store.getState().ui.view);

    // Track the last seen refreshKey so we can force a remount when it increments.
    // This covers flows like "Finish session" or import that change persisted data
    // without changing the view name, where the current view would otherwise show
    // stale content. Treat undefined (absent key) as 0.
    let lastRefreshKey = store.getState().ui.refreshKey ?? 0;

    // Subscribe to state changes.
    // Re-render when the view changes OR when refreshKey increments (forced remount).
    // Normal in-view updates (stopwatch tick, per-set weight picks) do NOT increment
    // refreshKey and therefore do NOT trigger a full remount.
    store.subscribe((state) => {
      const currentKey = state.ui.refreshKey ?? 0;
      if (currentKey !== lastRefreshKey) {
        lastRefreshKey = currentKey;
        // Force remount by clearing activeView so renderView re-enters even if
        // the view name hasn't changed.
        activeView = null;
      }
      renderView(state.ui.view);
    });
  }

  function unmount(): void {
    if (activeCleanup !== null) {
      activeCleanup();
      activeCleanup = null;
    }
    clear(root);
  }

  return { mount, unmount };
}
