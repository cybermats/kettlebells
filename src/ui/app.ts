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

    // Subscribe to state changes; only re-render when the active view changes.
    store.subscribe((state) => {
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
