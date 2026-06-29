/**
 * Tests for app-state.ts — shape and defaults.
 */
import { describe, it, expect } from "vitest";
import type { AppState, StopwatchState, ViewName } from "./app-state";

describe("AppState type contract", () => {
  it("StopwatchState stopped initial shape", () => {
    const sw: StopwatchState = {
      running: false,
      startedAtMs: null,
      accumulatedMs: 0,
    };
    expect(sw.running).toBe(false);
    expect(sw.startedAtMs).toBeNull();
    expect(sw.accumulatedMs).toBe(0);
  });

  it("ViewName union covers expected views", () => {
    const views: ViewName[] = ["session", "history", "settings"];
    expect(views).toHaveLength(3);
  });

  it("AppState shape has required slices", () => {
    // Create a minimal valid AppState to verify TypeScript accepts the shape at compile time.
    const state: AppState = {
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
    expect(state.sessions).toEqual([]);
    expect(state.ui.view).toBe("session");
    expect(state.ui.draftSession).toBeNull();
  });
});
