/**
 * Public surface of the state module.
 *
 * Import from here (not from individual files) when wiring up in main.ts or ui/:
 *
 *   import { createStore, setView, addSession, elapsedMs } from "./state";
 *   import type { AppState, ViewName, Store } from "./state";
 */
export type { ViewName, StopwatchState, AppState } from "./app-state";
export type { Store, StoreOptions, Updater as StoreUpdater } from "./store";
export { createStore } from "./store";
export type { Updater } from "./actions";
export {
  setView,
  setSettings,
  setProgression,
  addSession,
  setDraftSession,
  startStopwatch,
  pauseStopwatch,
  resetStopwatch,
  elapsedMs,
  incrementRefreshKey,
} from "./actions";
