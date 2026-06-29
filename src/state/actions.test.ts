/**
 * Tests for actions.ts — pure updater functions.
 */
import { describe, it, expect } from "vitest";
import type { AppState } from "./app-state";
import type { Session, Settings, ProgressionState } from "../domain/types";
import {
  setView,
  setSettings,
  setProgression,
  addSession,
  setDraftSession,
  startStopwatch,
  pauseStopwatch,
  resetStopwatch,
  elapsedMs,
} from "./actions";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeSession(id: string): Session {
  return {
    id,
    date: "2026-06-29",
    swings: [],
    getups: [],
  };
}

function makeInitialState(): AppState {
  return {
    sessions: [],
    settings: {
      ownedBellsKg: [16, 20, 24],
      goal: {
        swingTargetKg: 32,
        getupTargetKg: 32,
        swingStandardSec: 300,
        getupStandardSec: 600,
      },
      enforceOneVariableAtATime: true,
      theme: "auto",
    },
    progression: {
      swing: { baseKg: 16, nextKg: 20, heavySets: 0 },
      getup: { baseKg: 16, nextKg: 20, heavyReps: 0 },
    },
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
}

// ---------------------------------------------------------------------------
// setView
// ---------------------------------------------------------------------------

describe("setView", () => {
  it("changes ui.view to the target view", () => {
    const state = makeInitialState();
    const next = setView("history")(state);
    expect(next.ui.view).toBe("history");
  });

  it("does not mutate other slices", () => {
    const state = makeInitialState();
    const next = setView("settings")(state);
    expect(next.sessions).toBe(state.sessions);
    expect(next.settings).toBe(state.settings);
    expect(next.progression).toBe(state.progression);
  });

  it("does not mutate the original state", () => {
    const state = makeInitialState();
    setView("history")(state);
    expect(state.ui.view).toBe("session");
  });
});

// ---------------------------------------------------------------------------
// setSettings
// ---------------------------------------------------------------------------

describe("setSettings", () => {
  it("replaces settings with the new value", () => {
    const state = makeInitialState();
    const newSettings: Settings = {
      ownedBellsKg: [24, 32],
      goal: {
        swingTargetKg: 32,
        getupTargetKg: 32,
        swingStandardSec: 300,
        getupStandardSec: 600,
      },
      enforceOneVariableAtATime: false,
      theme: "dark",
    };
    const next = setSettings(newSettings)(state);
    expect(next.settings).toEqual(newSettings);
  });

  it("does not mutate other slices", () => {
    const state = makeInitialState();
    const next = setSettings({ ...state.settings, theme: "dark" })(state);
    expect(next.sessions).toBe(state.sessions);
    expect(next.progression).toBe(state.progression);
  });
});

// ---------------------------------------------------------------------------
// setProgression
// ---------------------------------------------------------------------------

describe("setProgression", () => {
  it("replaces progression with the new value", () => {
    const state = makeInitialState();
    const newProgression: ProgressionState = {
      swing: { baseKg: 20, nextKg: 24, heavySets: 5 },
      getup: { baseKg: 20, nextKg: 24, heavyReps: 4 },
    };
    const next = setProgression(newProgression)(state);
    expect(next.progression).toEqual(newProgression);
  });

  it("does not mutate other slices", () => {
    const state = makeInitialState();
    const prog: ProgressionState = {
      swing: { baseKg: 20, nextKg: 24, heavySets: 5 },
      getup: { baseKg: 20, nextKg: 24, heavyReps: 4 },
    };
    const next = setProgression(prog)(state);
    expect(next.sessions).toBe(state.sessions);
    expect(next.settings).toBe(state.settings);
  });
});

// ---------------------------------------------------------------------------
// addSession
// ---------------------------------------------------------------------------

describe("addSession", () => {
  it("prepends the new session (most recent first)", () => {
    const state = makeInitialState();
    const s1 = makeSession("s1");
    const afterFirst = addSession(s1)(state);
    expect(afterFirst.sessions).toHaveLength(1);
    expect(afterFirst.sessions[0]).toEqual(s1);

    const s2 = makeSession("s2");
    const afterSecond = addSession(s2)(afterFirst);
    expect(afterSecond.sessions[0]).toEqual(s2);
    expect(afterSecond.sessions[1]).toEqual(s1);
  });

  it("does not mutate the original sessions array", () => {
    const state = makeInitialState();
    const originalSessions = state.sessions;
    addSession(makeSession("x"))(state);
    expect(originalSessions).toHaveLength(0);
  });

  it("does not mutate other slices", () => {
    const state = makeInitialState();
    const next = addSession(makeSession("s1"))(state);
    expect(next.settings).toBe(state.settings);
    expect(next.progression).toBe(state.progression);
  });
});

// ---------------------------------------------------------------------------
// setDraftSession
// ---------------------------------------------------------------------------

describe("setDraftSession", () => {
  it("sets draftSession to a Session", () => {
    const state = makeInitialState();
    const draft = makeSession("draft-1");
    const next = setDraftSession(draft)(state);
    expect(next.ui.draftSession).toEqual(draft);
  });

  it("clears draftSession to null", () => {
    const state = makeInitialState();
    const withDraft = setDraftSession(makeSession("d"))(state);
    const cleared = setDraftSession(null)(withDraft);
    expect(cleared.ui.draftSession).toBeNull();
  });

  it("does not mutate other slices", () => {
    const state = makeInitialState();
    const next = setDraftSession(makeSession("d"))(state);
    expect(next.sessions).toBe(state.sessions);
    expect(next.settings).toBe(state.settings);
    expect(next.progression).toBe(state.progression);
  });
});

// ---------------------------------------------------------------------------
// Stopwatch actions + elapsedMs selector
// ---------------------------------------------------------------------------

describe("startStopwatch", () => {
  it("sets running=true and records startedAtMs", () => {
    const state = makeInitialState();
    const nowMs = 1_000_000;
    const next = startStopwatch(nowMs)(state);
    expect(next.ui.stopwatch.running).toBe(true);
    expect(next.ui.stopwatch.startedAtMs).toBe(nowMs);
  });

  it("preserves accumulatedMs (for resume after pause)", () => {
    const state = makeInitialState();
    // Simulate a previously paused watch with 5000 ms banked
    const paused: AppState = {
      ...state,
      ui: {
        ...state.ui,
        stopwatch: { running: false, startedAtMs: null, accumulatedMs: 5000 },
      },
    };
    const nowMs = 2_000_000;
    const next = startStopwatch(nowMs)(paused);
    expect(next.ui.stopwatch.accumulatedMs).toBe(5000);
    expect(next.ui.stopwatch.startedAtMs).toBe(nowMs);
  });

  it("does not mutate other slices", () => {
    const state = makeInitialState();
    const next = startStopwatch(1000)(state);
    expect(next.sessions).toBe(state.sessions);
    expect(next.settings).toBe(state.settings);
  });
});

describe("pauseStopwatch", () => {
  it("sets running=false and banks elapsed time into accumulatedMs", () => {
    const startMs = 1_000_000;
    const nowMs = 1_005_000; // 5 s later
    const state: AppState = {
      ...makeInitialState(),
      ui: {
        ...makeInitialState().ui,
        stopwatch: { running: true, startedAtMs: startMs, accumulatedMs: 0 },
      },
    };
    const next = pauseStopwatch(nowMs)(state);
    expect(next.ui.stopwatch.running).toBe(false);
    expect(next.ui.stopwatch.accumulatedMs).toBe(5000);
    expect(next.ui.stopwatch.startedAtMs).toBeNull();
  });

  it("accumulates across multiple pause/resume cycles", () => {
    // Round 1: 3 s
    const s1: AppState = {
      ...makeInitialState(),
      ui: {
        ...makeInitialState().ui,
        stopwatch: {
          running: true,
          startedAtMs: 1_000_000,
          accumulatedMs: 0,
        },
      },
    };
    const afterPause1 = pauseStopwatch(1_003_000)(s1);
    expect(afterPause1.ui.stopwatch.accumulatedMs).toBe(3000);

    // Round 2: resume, run 7 s
    const afterResume = startStopwatch(2_000_000)(afterPause1);
    const afterPause2 = pauseStopwatch(2_007_000)(afterResume);
    expect(afterPause2.ui.stopwatch.accumulatedMs).toBe(10000);
  });

  it("is a no-op (does not error) if watch is already stopped", () => {
    const state = makeInitialState(); // not running
    expect(() => pauseStopwatch(1000)(state)).not.toThrow();
  });
});

describe("resetStopwatch", () => {
  it("clears all stopwatch state back to initial", () => {
    const running: AppState = {
      ...makeInitialState(),
      ui: {
        ...makeInitialState().ui,
        stopwatch: {
          running: true,
          startedAtMs: 1_000_000,
          accumulatedMs: 2000,
        },
      },
    };
    const next = resetStopwatch()(running);
    expect(next.ui.stopwatch.running).toBe(false);
    expect(next.ui.stopwatch.startedAtMs).toBeNull();
    expect(next.ui.stopwatch.accumulatedMs).toBe(0);
  });
});

describe("elapsedMs", () => {
  it("returns accumulatedMs when stopped", () => {
    const sw = { running: false, startedAtMs: null, accumulatedMs: 4200 };
    expect(elapsedMs(sw, 9_999_999)).toBe(4200);
  });

  it("returns accumulated + time-since-start when running", () => {
    const sw = {
      running: true,
      startedAtMs: 1_000_000,
      accumulatedMs: 1000,
    };
    const nowMs = 1_004_000; // 4 s since start
    expect(elapsedMs(sw, nowMs)).toBe(5000);
  });

  it("returns 0 for a fresh stopwatch", () => {
    const sw = { running: false, startedAtMs: null, accumulatedMs: 0 };
    expect(elapsedMs(sw, Date.now())).toBe(0);
  });
});
