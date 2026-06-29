import type { Session, Settings, ProgressionState, Goal, WorkSet } from "./types.js";
import {
  nextOwnedAbove,
  prescribeSession,
  readiness,
  advance,
  canAdvanceWeight,
  tryAdvance,
  goalReached,
} from "./coach.js";
import { defaultSettings, initialProgression, SWING_SETS, GETUP_SETS } from "./standards.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<Session> = {}): Session {
  const s = defaultSettings();
  const p = initialProgression(s);
  const { swings, getups } = prescribeSession(s, p);
  return {
    id: "test-1",
    date: "2026-06-29",
    swings,
    getups,
    ...overrides,
  };
}

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    swingTargetKg: 32,
    getupTargetKg: 32,
    swingStandardSec: 300,
    getupStandardSec: 600,
    ...overrides,
  };
}

// ─── nextOwnedAbove ───────────────────────────────────────────────────────────

describe("nextOwnedAbove", () => {
  it("returns the smallest bell strictly above the given weight", () => {
    expect(nextOwnedAbove([16, 24, 32], 16)).toBe(24);
    expect(nextOwnedAbove([16, 24, 32], 24)).toBe(32);
  });

  it("returns undefined when no bell is above the given weight", () => {
    expect(nextOwnedAbove([16, 24, 32], 32)).toBeUndefined();
    expect(nextOwnedAbove([16, 24, 32], 40)).toBeUndefined();
  });

  it("handles a single-bell inventory", () => {
    expect(nextOwnedAbove([24], 24)).toBeUndefined();
    expect(nextOwnedAbove([24], 16)).toBe(24);
  });

  it("handles large gaps between bells", () => {
    expect(nextOwnedAbove([16, 48], 16)).toBe(48);
    expect(nextOwnedAbove([16, 48], 20)).toBe(48);
  });

  it("sorts unsorted input defensively", () => {
    expect(nextOwnedAbove([32, 16, 24], 16)).toBe(24);
    expect(nextOwnedAbove([32, 16, 24], 24)).toBe(32);
  });

  it("handles an empty inventory", () => {
    expect(nextOwnedAbove([], 16)).toBeUndefined();
  });
});

// ─── prescribeSession: swings ─────────────────────────────────────────────────

describe("prescribeSession — swings", () => {
  it("produces exactly 10 swing sets", () => {
    const s = defaultSettings();
    const p = initialProgression(s);
    const { swings } = prescribeSession(s, p);
    expect(swings).toHaveLength(SWING_SETS);
  });

  it("each swing set has kind=swing, reps=10, prescribedRestSec=30", () => {
    const s = defaultSettings();
    const p = initialProgression(s);
    const { swings } = prescribeSession(s, p);
    for (const set of swings) {
      expect(set.kind).toBe("swing");
      expect(set.reps).toBe(10);
      expect(set.prescribedRestSec).toBe(30);
    }
  });

  it("all sets use baseKg when heavySets=0", () => {
    const s = defaultSettings();
    const p = initialProgression(s); // heavySets=0
    const { swings } = prescribeSession(s, p);
    for (const set of swings) {
      expect(set.weightKg).toBe(p.swing.baseKg);
    }
  });

  it("last heavySets sets use nextKg, rest use baseKg", () => {
    const s = defaultSettings();
    const p: ProgressionState = {
      ...initialProgression(s),
      swing: { baseKg: 16, nextKg: 24, heavySets: 3 },
    };
    const { swings } = prescribeSession(s, p);
    // first 7 sets → 16 kg
    for (let i = 0; i < 7; i++) {
      expect(swings[i]!.weightKg).toBe(16);
    }
    // last 3 sets → 24 kg
    for (let i = 7; i < 10; i++) {
      expect(swings[i]!.weightKg).toBe(24);
    }
  });

  it("all 10 sets use nextKg when heavySets=10", () => {
    const s = defaultSettings();
    const p: ProgressionState = {
      ...initialProgression(s),
      swing: { baseKg: 16, nextKg: 24, heavySets: 10 },
    };
    const { swings } = prescribeSession(s, p);
    for (const set of swings) {
      expect(set.weightKg).toBe(24);
    }
  });

  it("only prescribes weights present in ownedBellsKg", () => {
    const s = defaultSettings();
    const p: ProgressionState = {
      ...initialProgression(s),
      swing: { baseKg: 16, nextKg: 24, heavySets: 5 },
    };
    const { swings } = prescribeSession(s, p);
    for (const set of swings) {
      expect(s.ownedBellsKg).toContain(set.weightKg);
    }
  });
});

// ─── prescribeSession: get-ups ─────────────────────────────────────────────────

describe("prescribeSession — get-ups", () => {
  it("produces exactly 10 getup sets", () => {
    const s = defaultSettings();
    const p = initialProgression(s);
    const { getups } = prescribeSession(s, p);
    expect(getups).toHaveLength(GETUP_SETS);
  });

  it("each getup set has kind=getup, reps=1, prescribedRestSec=60", () => {
    const s = defaultSettings();
    const p = initialProgression(s);
    const { getups } = prescribeSession(s, p);
    for (const set of getups) {
      expect(set.kind).toBe("getup");
      expect(set.reps).toBe(1);
      expect(set.prescribedRestSec).toBe(60);
    }
  });

  it("all sets use baseKg when heavyReps=0", () => {
    const s = defaultSettings();
    const p = initialProgression(s); // heavyReps=0
    const { getups } = prescribeSession(s, p);
    for (const set of getups) {
      expect(set.weightKg).toBe(p.getup.baseKg);
    }
  });

  it("last heavyReps sets use nextKg when heavyReps=4", () => {
    const s = defaultSettings();
    const p: ProgressionState = {
      ...initialProgression(s),
      getup: { baseKg: 16, nextKg: 24, heavyReps: 4 },
    };
    const { getups } = prescribeSession(s, p);
    // first 6 sets → 16 kg
    for (let i = 0; i < 6; i++) {
      expect(getups[i]!.weightKg).toBe(16);
    }
    // last 4 sets → 24 kg
    for (let i = 6; i < 10; i++) {
      expect(getups[i]!.weightKg).toBe(24);
    }
  });

  it("the heavy trailing block is balanced per side (equal R and L)", () => {
    // For heavyReps=4 (last 4 sets), indices 6,7,8,9
    // Sides alternate R,L,R,L,... so:
    // index 0=R, 1=L, 2=R, 3=L, 4=R, 5=L, 6=R, 7=L, 8=R, 9=L
    // Last 4 (indices 6,7,8,9): R,L,R,L → 2R + 2L → balanced ✓
    // This holds for any even heavyReps value
    const s = defaultSettings();
    for (const heavyReps of [0, 2, 4, 6, 8, 10]) {
      const p: ProgressionState = {
        ...initialProgression(s),
        getup: { baseKg: 16, nextKg: 24, heavyReps },
      };
      const { getups } = prescribeSession(s, p);
      // Count heavy sets by side
      // Side assignment: even index → R, odd index → L
      const heavySets = getups.slice(10 - heavyReps);
      const rightCount = heavySets.filter((_, i) => (10 - heavyReps + i) % 2 === 0).length;
      const leftCount = heavySets.filter((_, i) => (10 - heavyReps + i) % 2 === 1).length;
      expect(rightCount).toBe(heavyReps / 2);
      expect(leftCount).toBe(heavyReps / 2);
    }
  });

  it("only prescribes weights present in ownedBellsKg for get-ups", () => {
    const s = defaultSettings();
    const p: ProgressionState = {
      ...initialProgression(s),
      getup: { baseKg: 16, nextKg: 24, heavyReps: 6 },
    };
    const { getups } = prescribeSession(s, p);
    for (const set of getups) {
      expect(s.ownedBellsKg).toContain(set.weightKg);
    }
  });
});

// ─── readiness ────────────────────────────────────────────────────────────────

describe("readiness", () => {
  it("returns false for both when history is empty", () => {
    const s = defaultSettings();
    const r = readiness([], s);
    expect(r.swing).toBe(false);
    expect(r.getup).toBe(false);
  });

  it("returns swing=true when most-recent session met the swing standard", () => {
    const s = defaultSettings();
    const session = makeSession({ swingBlockSec: 295 }); // under 300
    const r = readiness([session], s);
    expect(r.swing).toBe(true);
  });

  it("returns swing=false when most-recent session exceeded the swing standard", () => {
    const s = defaultSettings();
    const session = makeSession({ swingBlockSec: 310 }); // over 300
    const r = readiness([session], s);
    expect(r.swing).toBe(false);
  });

  it("returns swing=false when most-recent session has no swingBlockSec", () => {
    const s = defaultSettings();
    // Omit swingBlockSec entirely (exactOptionalPropertyTypes: swingBlockSec: undefined is not valid)
    const session = makeSession({});
    // The session produced by makeSession already omits swingBlockSec, so this tests the "missing" case.
    // Force-delete the key to be explicit:
    const stripped: Session = { ...session };
    // swingBlockSec is already absent from the base makeSession (no overrides)
    const r = readiness([stripped], s);
    expect(r.swing).toBe(false);
  });

  it("returns swing=true when swingBlockSec equals the standard exactly", () => {
    const s = defaultSettings();
    const session = makeSession({ swingBlockSec: 300 }); // exactly 300
    const r = readiness([session], s);
    expect(r.swing).toBe(true);
  });

  it("returns getup=true when most-recent session met the getup standard", () => {
    const s = defaultSettings();
    const session = makeSession({ getupBlockSec: 590 }); // under 600
    const r = readiness([session], s);
    expect(r.getup).toBe(true);
  });

  it("returns getup=false when most-recent session exceeded the getup standard", () => {
    const s = defaultSettings();
    const session = makeSession({ getupBlockSec: 610 }); // over 600
    const r = readiness([session], s);
    expect(r.getup).toBe(false);
  });

  it("returns getup=false when most-recent session has no getupBlockSec", () => {
    const s = defaultSettings();
    // Omit getupBlockSec entirely (exactOptionalPropertyTypes prevents explicit undefined)
    const session = makeSession({ swingBlockSec: 295 }); // has swing, but no getup block time
    const r = readiness([session], s);
    expect(r.getup).toBe(false);
  });

  it("uses the most-recent session (last in array), not the first", () => {
    const s = defaultSettings();
    const old = makeSession({ swingBlockSec: 295 }); // met
    const recent = makeSession({ swingBlockSec: 320 }); // not met
    const r = readiness([old, recent], s);
    expect(r.swing).toBe(false);
  });

  it("swing and getup readiness are independent", () => {
    const s = defaultSettings();
    const session = makeSession({ swingBlockSec: 295, getupBlockSec: 650 });
    const r = readiness([session], s);
    expect(r.swing).toBe(true);
    expect(r.getup).toBe(false);
  });
});

// ─── advance ─────────────────────────────────────────────────────────────────

describe("advance — swings", () => {
  it("increments heavySets by 1", () => {
    const s = defaultSettings();
    const p = initialProgression(s); // heavySets=0
    const p2 = advance(p, s, "swing");
    expect(p2.swing.heavySets).toBe(1);
  });

  it("does not mutate the input state", () => {
    const s = defaultSettings();
    const p = initialProgression(s);
    const original = p.swing.heavySets;
    advance(p, s, "swing");
    expect(p.swing.heavySets).toBe(original);
  });

  it("increments through 0→10 without rollover", () => {
    const s = defaultSettings();
    let p = initialProgression(s);
    for (let i = 0; i < 9; i++) {
      p = advance(p, s, "swing");
      expect(p.swing.heavySets).toBe(i + 1);
      expect(p.swing.baseKg).toBe(16); // base unchanged
    }
  });

  it("rolls over when heavySets reaches 10: base=nextKg, heavySets=0, nextKg advances", () => {
    // Per spec: "heavySets + 1; if it reaches SWING_SETS (10) → roll over"
    // Advancing from heavySets=9 → newHeavy=10 → rollover immediately.
    const s = defaultSettings(); // bells: 16, 24, 32
    const p: ProgressionState = {
      ...initialProgression(s),
      swing: { baseKg: 16, nextKg: 24, heavySets: 9 },
    };
    const p2 = advance(p, s, "swing");
    expect(p2.swing.baseKg).toBe(24); // rolled over: 24 is now the base
    expect(p2.swing.heavySets).toBe(0); // heavy count reset
    expect(p2.swing.nextKg).toBe(32); // next moves to the following owned bell
  });

  it("rollover: nextKg stays at base when at the heaviest bell", () => {
    const s = defaultSettings(); // bells: 16, 24, 32
    const p: ProgressionState = {
      ...initialProgression(s),
      swing: { baseKg: 24, nextKg: 32, heavySets: 9 },
    };
    const p2 = advance(p, s, "swing");
    // rolls over: base=32, heavySets=0, nextKg=32 (no bell above 32)
    expect(p2.swing.baseKg).toBe(32);
    expect(p2.swing.heavySets).toBe(0);
    expect(p2.swing.nextKg).toBe(32);
  });
});

describe("advance — getups", () => {
  it("increments heavyReps by 2", () => {
    const s = defaultSettings();
    const p = initialProgression(s); // heavyReps=0
    const p2 = advance(p, s, "getup");
    expect(p2.getup.heavyReps).toBe(2);
  });

  it("does not mutate input state", () => {
    const s = defaultSettings();
    const p = initialProgression(s);
    advance(p, s, "getup");
    expect(p.getup.heavyReps).toBe(0);
  });

  it("increments through 0→10 (by 2) triggering rollover at 10", () => {
    const s = defaultSettings();
    let p = initialProgression(s);
    for (let i = 0; i < 4; i++) {
      p = advance(p, s, "getup");
      expect(p.getup.heavyReps).toBe((i + 1) * 2);
      expect(p.getup.baseKg).toBe(16);
    }
    // advance once more → 10 → rollover
    p = advance(p, s, "getup");
    expect(p.getup.baseKg).toBe(24);
    expect(p.getup.heavyReps).toBe(0);
    expect(p.getup.nextKg).toBe(32);
  });

  it("rollover at heavyReps=8 advance: 8→10 triggers rollover", () => {
    const s = defaultSettings();
    const p: ProgressionState = {
      ...initialProgression(s),
      getup: { baseKg: 16, nextKg: 24, heavyReps: 8 },
    };
    const p2 = advance(p, s, "getup");
    expect(p2.getup.baseKg).toBe(24);
    expect(p2.getup.heavyReps).toBe(0);
    expect(p2.getup.nextKg).toBe(32);
  });

  it("advancing swing does not affect getup state", () => {
    const s = defaultSettings();
    const p = initialProgression(s);
    const p2 = advance(p, s, "swing");
    expect(p2.getup).toEqual(p.getup);
  });

  it("advancing getup does not affect swing state", () => {
    const s = defaultSettings();
    const p = initialProgression(s);
    const p2 = advance(p, s, "getup");
    expect(p2.swing).toEqual(p.swing);
  });
});

// ─── canAdvanceWeight + tryAdvance ────────────────────────────────────────────

describe("canAdvanceWeight", () => {
  it("returns ok=false (no heavier bell) when at heaviest bell and heavySets=0", () => {
    const s = defaultSettings(); // max bell 32 kg
    const p: ProgressionState = {
      ...initialProgression(s),
      swing: { baseKg: 32, nextKg: 32, heavySets: 0 },
    };
    const result = canAdvanceWeight([], s, p, "swing");
    expect(result.ok).toBe(false);
  });

  it("returns ok=false (not ready) when enforceOneVariableAtATime=true and no history", () => {
    const s = defaultSettings(); // enforce=true
    const p = initialProgression(s);
    const result = canAdvanceWeight([], s, p, "swing");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBeTruthy();
    }
  });

  it("returns ok=true when enforce=false regardless of readiness", () => {
    const s: Settings = { ...defaultSettings(), enforceOneVariableAtATime: false };
    const p = initialProgression(s);
    // No history → not ready, but enforce is off
    const result = canAdvanceWeight([], s, p, "swing");
    expect(result.ok).toBe(true);
  });

  it("returns ok=true when enforce=true and readiness is met", () => {
    const s = defaultSettings(); // enforce=true
    const p = initialProgression(s);
    const session = makeSession({ swingBlockSec: 295 }); // met swing standard
    const result = canAdvanceWeight([session], s, p, "swing");
    expect(result.ok).toBe(true);
  });

  it("returns ok=false when enforce=true and readiness not met", () => {
    const s = defaultSettings(); // enforce=true
    const p = initialProgression(s);
    const session = makeSession({ swingBlockSec: 310 }); // did not meet swing standard
    const result = canAdvanceWeight([session], s, p, "swing");
    expect(result.ok).toBe(false);
  });

  it("checks getup readiness independently", () => {
    const s = defaultSettings();
    const p = initialProgression(s);
    const session = makeSession({ swingBlockSec: 295, getupBlockSec: 650 });
    const swingResult = canAdvanceWeight([session], s, p, "swing");
    const getupResult = canAdvanceWeight([session], s, p, "getup");
    expect(swingResult.ok).toBe(true);
    expect(getupResult.ok).toBe(false);
  });
});

describe("tryAdvance", () => {
  it("returns ok=false when canAdvanceWeight fails", () => {
    const s = defaultSettings(); // enforce=true
    const p = initialProgression(s);
    // No history → not ready
    const result = tryAdvance([], s, p, "swing");
    expect(result.ok).toBe(false);
  });

  it("returns new progression when advance is allowed", () => {
    const s: Settings = { ...defaultSettings(), enforceOneVariableAtATime: false };
    const p = initialProgression(s);
    const result = tryAdvance([], s, p, "swing");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.progression.swing.heavySets).toBe(1);
    }
  });

  it("does not mutate original progression", () => {
    const s: Settings = { ...defaultSettings(), enforceOneVariableAtATime: false };
    const p = initialProgression(s);
    tryAdvance([], s, p, "swing");
    expect(p.swing.heavySets).toBe(0);
  });
});

// ─── goalReached ─────────────────────────────────────────────────────────────

describe("goalReached", () => {
  function makeGoalSession(
    swingKg: number,
    getupKg: number,
    swingBlockSec?: number,
    getupBlockSec?: number,
  ): Session {
    const swings: WorkSet[] = Array.from({ length: 10 }, () => ({
      kind: "swing" as const,
      weightKg: swingKg,
      reps: 10,
      prescribedRestSec: 30,
    }));
    const getups: WorkSet[] = Array.from({ length: 10 }, () => ({
      kind: "getup" as const,
      weightKg: getupKg,
      reps: 1,
      prescribedRestSec: 60,
    }));
    return {
      id: "g1",
      date: "2026-06-29",
      swings,
      getups,
      ...(swingBlockSec !== undefined ? { swingBlockSec } : {}),
      ...(getupBlockSec !== undefined ? { getupBlockSec } : {}),
    };
  }

  it("returns true when all sets at target weight and both blocks within standard", () => {
    const goal = makeGoal(); // target 32kg, 300s/600s
    const session = makeGoalSession(32, 32, 295, 590);
    expect(goalReached(session, goal)).toBe(true);
  });

  it("returns false when swing weight is below target", () => {
    const goal = makeGoal();
    const session = makeGoalSession(24, 32, 295, 590);
    expect(goalReached(session, goal)).toBe(false);
  });

  it("returns false when getup weight is below target", () => {
    const goal = makeGoal();
    const session = makeGoalSession(32, 24, 295, 590);
    expect(goalReached(session, goal)).toBe(false);
  });

  it("returns false when swing block exceeded standard", () => {
    const goal = makeGoal();
    const session = makeGoalSession(32, 32, 310, 590);
    expect(goalReached(session, goal)).toBe(false);
  });

  it("returns false when getup block exceeded standard", () => {
    const goal = makeGoal();
    const session = makeGoalSession(32, 32, 295, 610);
    expect(goalReached(session, goal)).toBe(false);
  });

  it("returns false when swingBlockSec is missing", () => {
    const goal = makeGoal();
    const session = makeGoalSession(32, 32, undefined, 590);
    expect(goalReached(session, goal)).toBe(false);
  });

  it("returns false when getupBlockSec is missing", () => {
    const goal = makeGoal();
    const session = makeGoalSession(32, 32, 295, undefined);
    expect(goalReached(session, goal)).toBe(false);
  });

  it("returns true when block times exactly equal the standards", () => {
    const goal = makeGoal();
    const session = makeGoalSession(32, 32, 300, 600);
    expect(goalReached(session, goal)).toBe(true);
  });

  it("returns false when any swing set is below target weight", () => {
    const goal = makeGoal();
    // Mix: 9 sets at 32kg, 1 set at 24kg
    const swings: WorkSet[] = [
      ...Array.from({ length: 9 }, () => ({
        kind: "swing" as const,
        weightKg: 32,
        reps: 10,
        prescribedRestSec: 30,
      })),
      { kind: "swing" as const, weightKg: 24, reps: 10, prescribedRestSec: 30 },
    ];
    const getups: WorkSet[] = Array.from({ length: 10 }, () => ({
      kind: "getup" as const,
      weightKg: 32,
      reps: 1,
      prescribedRestSec: 60,
    }));
    const session: Session = {
      id: "g2",
      date: "2026-06-29",
      swings,
      getups,
      swingBlockSec: 295,
      getupBlockSec: 590,
    };
    expect(goalReached(session, goal)).toBe(false);
  });
});
