import type { Goal, Settings } from "./types.js";
import {
  SWING_SETS,
  SWING_REPS,
  GETUP_SETS,
  GETUP_REPS,
  swingRestSec,
  getupRestSec,
  defaultSettings,
  initialProgression,
} from "./standards.js";

describe("program constants", () => {
  it("has correct set/rep constants", () => {
    expect(SWING_SETS).toBe(10);
    expect(SWING_REPS).toBe(10);
    expect(GETUP_SETS).toBe(10);
    expect(GETUP_REPS).toBe(1);
  });
});

describe("swingRestSec", () => {
  it("returns 30 for the default 300s standard", () => {
    const goal: Goal = {
      swingTargetKg: 32,
      getupTargetKg: 32,
      swingStandardSec: 300,
      getupStandardSec: 600,
    };
    expect(swingRestSec(goal)).toBe(30);
  });

  it("rounds correctly for non-divisible standards", () => {
    const goal: Goal = {
      swingTargetKg: 32,
      getupTargetKg: 32,
      swingStandardSec: 305,
      getupStandardSec: 600,
    };
    // 305 / 10 = 30.5 → rounds to 31
    expect(swingRestSec(goal)).toBe(31);
  });
});

describe("getupRestSec", () => {
  it("returns 60 for the default 600s standard", () => {
    const goal: Goal = {
      swingTargetKg: 32,
      getupTargetKg: 32,
      swingStandardSec: 300,
      getupStandardSec: 600,
    };
    expect(getupRestSec(goal)).toBe(60);
  });

  it("rounds correctly for non-divisible standards", () => {
    const goal: Goal = {
      swingTargetKg: 32,
      getupTargetKg: 32,
      swingStandardSec: 300,
      getupStandardSec: 605,
    };
    // 605 / 10 = 60.5 → rounds to 61
    expect(getupRestSec(goal)).toBe(61);
  });
});

describe("defaultSettings", () => {
  it("returns the Simple standard defaults", () => {
    const s = defaultSettings();
    expect(s.ownedBellsKg).toEqual([16, 24, 32]);
    expect(s.goal.swingTargetKg).toBe(32);
    expect(s.goal.getupTargetKg).toBe(32);
    expect(s.goal.swingStandardSec).toBe(300);
    expect(s.goal.getupStandardSec).toBe(600);
    expect(s.enforceOneVariableAtATime).toBe(true);
    expect(s.theme).toBe("auto");
  });

  it("returns a new object each call (no shared reference)", () => {
    const a = defaultSettings();
    const b = defaultSettings();
    a.ownedBellsKg.push(40);
    expect(b.ownedBellsKg).toEqual([16, 24, 32]);
  });
});

describe("initialProgression", () => {
  it("sets baseKg to first owned bell and nextKg to second", () => {
    const settings = defaultSettings();
    const p = initialProgression(settings);
    expect(p.swing.baseKg).toBe(16);
    expect(p.swing.nextKg).toBe(24);
    expect(p.swing.heavySets).toBe(0);
    expect(p.getup.baseKg).toBe(16);
    expect(p.getup.nextKg).toBe(24);
    expect(p.getup.heavyReps).toBe(0);
  });

  it("sets nextKg equal to baseKg when only one bell owned", () => {
    const settings: Settings = {
      ownedBellsKg: [24],
      goal: defaultSettings().goal,
      enforceOneVariableAtATime: true,
      theme: "auto",
    };
    const p = initialProgression(settings);
    expect(p.swing.baseKg).toBe(24);
    expect(p.swing.nextKg).toBe(24);
    expect(p.getup.baseKg).toBe(24);
    expect(p.getup.nextKg).toBe(24);
  });

  it("uses the first two bells from a larger inventory", () => {
    const settings: Settings = {
      ownedBellsKg: [12, 16, 20, 24, 32],
      goal: defaultSettings().goal,
      enforceOneVariableAtATime: true,
      theme: "auto",
    };
    const p = initialProgression(settings);
    expect(p.swing.baseKg).toBe(12);
    expect(p.swing.nextKg).toBe(16);
  });
});
