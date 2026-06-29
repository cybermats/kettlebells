/**
 * Typed action helpers — pure updater functions for the state container.
 *
 * Each helper returns an `Updater` (a function from AppState → AppState) so
 * it can be passed directly to `store.setState`:
 *
 *   store.setState(setView("history"));
 *   store.setState(addSession(completedSession));
 *   store.setState(startStopwatch(Date.now()));
 *
 * All functions are pure: they never mutate their arguments and they never
 * call `Date.now()` — callers pass `nowMs` in where timing is needed so
 * behaviour is deterministic and easy to test.
 */
import type { AppState, ViewName, StopwatchState } from "./app-state";
import type { Session, Settings, ProgressionState } from "../domain/types";

/** An updater: takes the previous AppState, returns the next AppState. */
export type Updater = (prev: AppState) => AppState;

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/** Switch the active view. */
export function setView(view: ViewName): Updater {
  return (prev) => ({
    ...prev,
    ui: { ...prev.ui, view },
  });
}

// ---------------------------------------------------------------------------
// Persisted data slices
// ---------------------------------------------------------------------------

/** Replace the entire settings slice. */
export function setSettings(settings: Settings): Updater {
  return (prev) => ({ ...prev, settings });
}

/** Replace the entire progression slice. */
export function setProgression(progression: ProgressionState): Updater {
  return (prev) => ({ ...prev, progression });
}

/**
 * Prepend a completed session to the sessions list (newest-first order).
 * Returns a new sessions array; does not mutate the previous one.
 */
export function addSession(session: Session): Updater {
  return (prev) => ({
    ...prev,
    sessions: [session, ...prev.sessions],
  });
}

// ---------------------------------------------------------------------------
// Draft session (in-progress logging)
// ---------------------------------------------------------------------------

/** Set or clear the in-progress draft session. */
export function setDraftSession(session: Session | null): Updater {
  return (prev) => ({
    ...prev,
    ui: { ...prev.ui, draftSession: session },
  });
}

// ---------------------------------------------------------------------------
// Stopwatch
// ---------------------------------------------------------------------------

/**
 * Start (or resume) the stopwatch.
 *
 * @param nowMs - Current epoch time in ms (pass Date.now() at the call site).
 */
export function startStopwatch(nowMs: number): Updater {
  return (prev) => ({
    ...prev,
    ui: {
      ...prev.ui,
      stopwatch: {
        running: true,
        startedAtMs: nowMs,
        accumulatedMs: prev.ui.stopwatch.accumulatedMs,
      },
    },
  });
}

/**
 * Pause the stopwatch, banking elapsed time into `accumulatedMs`.
 * If the watch is already stopped, the state is returned unchanged.
 *
 * @param nowMs - Current epoch time in ms (pass Date.now() at the call site).
 */
export function pauseStopwatch(nowMs: number): Updater {
  return (prev) => {
    const sw = prev.ui.stopwatch;
    if (!sw.running || sw.startedAtMs === null) {
      // Already stopped — no-op.
      return prev;
    }
    const banked = sw.accumulatedMs + (nowMs - sw.startedAtMs);
    const next: StopwatchState = {
      running: false,
      startedAtMs: null,
      accumulatedMs: banked,
    };
    return {
      ...prev,
      ui: { ...prev.ui, stopwatch: next },
    };
  };
}

/** Reset the stopwatch back to the fully-cleared initial state. */
export function resetStopwatch(): Updater {
  return (prev) => ({
    ...prev,
    ui: {
      ...prev.ui,
      stopwatch: {
        running: false,
        startedAtMs: null,
        accumulatedMs: 0,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Refresh key — force remount of the active view
// ---------------------------------------------------------------------------

/**
 * Increment `ui.refreshKey` to signal that the active view should be fully
 * remounted even though the view name has not changed.
 *
 * Use this after flows that update persisted state without navigating, e.g.:
 *  - "Finish session" → the session view should show a fresh prescription.
 *  - Import (replace-all) → the settings view should reflect the new data.
 *
 * Consumers treat `undefined` (absent key) as 0.
 */
export function incrementRefreshKey(): Updater {
  return (prev) => ({
    ...prev,
    ui: {
      ...prev.ui,
      refreshKey: (prev.ui.refreshKey ?? 0) + 1,
    },
  });
}

// ---------------------------------------------------------------------------
// Selectors (pure — not updaters)
// ---------------------------------------------------------------------------

/**
 * Compute how many milliseconds have elapsed on the stopwatch.
 *
 * @param stopwatch - The current StopwatchState snapshot.
 * @param nowMs     - Current epoch time in ms (pass Date.now() at call site).
 * @returns Total elapsed milliseconds.
 */
export function elapsedMs(stopwatch: StopwatchState, nowMs: number): number {
  if (!stopwatch.running || stopwatch.startedAtMs === null) {
    return stopwatch.accumulatedMs;
  }
  return stopwatch.accumulatedMs + (nowMs - stopwatch.startedAtMs);
}
