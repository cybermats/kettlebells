/**
 * App bootstrap — replaces the Phase 0 stub.
 *
 * Boot sequence:
 *  1. Load persisted state from localStorage.
 *  2. Build initial AppState (use domain defaults for null slices).
 *  3. Create the store; wire onChange → saveAll (persist on every change).
 *  4. Apply the stored theme preference.
 *  5. Mount the app shell into #app; subscribe to re-render on state change.
 *  6. Register the service worker (production only).
 */

import "./styles/main.css";

import { loadAll, saveAll } from "./storage/storage";
import { defaultSettings, initialProgression } from "./domain/standards";
import { createStore } from "./state/index";
import type { AppState } from "./state/index";
import { createApp } from "./ui/app";
import { applyTheme } from "./ui/theme";
import { registerServiceWorker } from "./pwa/register";

// ─── 1. Load persisted state ──────────────────────────────────────────────────

const persisted = loadAll();

// ─── 2. Build initial AppState ────────────────────────────────────────────────

const settings = persisted.settings ?? defaultSettings();
const progression = persisted.progression ?? initialProgression(settings);

const initialState: AppState = {
  sessions: persisted.sessions,
  settings,
  progression,
  ui: {
    view: "session",
    draftSession: null,
    stopwatch: {
      running: false,
      startedAtMs: null,
      accumulatedMs: 0,
    },
  },
};

// ─── 3. Create store + persistence wiring ────────────────────────────────────

const store = createStore(initialState, {
  onChange(state) {
    // Persist on every change; saveAll never throws (returns false on failure)
    saveAll({
      sessions: state.sessions,
      settings: state.settings,
      progression: state.progression,
    });
  },
});

// ─── 4. Apply theme ───────────────────────────────────────────────────────────

applyTheme(settings.theme);

// ─── 5. Mount app ─────────────────────────────────────────────────────────────

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) {
  throw new Error("Root element #app not found in DOM.");
}

const { mount } = createApp(store, appRoot);
mount();

// ─── 6. Register service worker ───────────────────────────────────────────────

registerServiceWorker();
