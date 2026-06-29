/**
 * AppState — the single source of truth for all runtime app state.
 *
 * Composed from domain types (imported from types.ts) plus UI-only slices
 * (current view, in-progress session draft, stopwatch). This module is
 * DOM-free and has no side effects.
 */
import type { Session, Settings, ProgressionState } from "../domain/types";

/** The named views the app can render. */
export type ViewName = "session" | "history" | "settings";

/**
 * Stopwatch state. All time values are epoch milliseconds so callers can
 * pass in Date.now() without any coupling to the Date global inside this
 * module.
 *
 * When `running` is false, `startedAtMs` is null and `accumulatedMs` holds
 * the total elapsed time banked across all previous run-segments.
 *
 * When `running` is true, `startedAtMs` records when the current segment
 * started; total elapsed = accumulatedMs + (nowMs - startedAtMs).
 */
export interface StopwatchState {
  running: boolean;
  /** Epoch ms when the current run-segment started; null when stopped. */
  startedAtMs: number | null;
  /** Total elapsed time banked from completed run-segments, in ms. */
  accumulatedMs: number;
}

/** The complete runtime state tree. */
export interface AppState {
  /** All completed sessions, newest-first (prepend on add). */
  sessions: Session[];
  /** User-configured settings: bell inventory, goal, theme. */
  settings: Settings;
  /** Per-exercise step-loading progression counters. */
  progression: ProgressionState;
  /** UI-only state that is NOT persisted to storage. */
  ui: {
    /** Which top-level view is currently visible. */
    view: ViewName;
    /**
     * The session being actively logged, or null when not in a session.
     * This is a mutable work-in-progress; it becomes a `Session` in
     * `sessions` once the user finishes and saves.
     */
    draftSession: Session | null;
    /** Live stopwatch driving per-set rest timing. */
    stopwatch: StopwatchState;
  };
}
