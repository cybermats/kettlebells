import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  safeGet,
  safeSet,
  loadSessions,
  saveSessions,
  loadSettings,
  saveSettings,
  loadProgression,
  saveProgression,
  loadAll,
  saveAll,
} from "./storage";
import type { Session, Settings, ProgressionState } from "../domain/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const swingSet = {
  kind: "swing" as const,
  weightKg: 24,
  reps: 10,
  prescribedRestSec: 30,
};

const getupSet = {
  kind: "getup" as const,
  weightKg: 16,
  reps: 1,
  prescribedRestSec: 60,
};

const session: Session = {
  id: "sess-1",
  date: "2026-01-01",
  swings: [swingSet],
  getups: [getupSet],
};

const settings: Settings = {
  ownedBellsKg: [16, 20, 24, 28, 32],
  goal: {
    swingTargetKg: 32,
    getupTargetKg: 32,
    swingStandardSec: 300,
    getupStandardSec: 600,
  },
  enforceOneVariableAtATime: true,
  theme: "auto",
};

const progression: ProgressionState = {
  swing: { baseKg: 24, nextKg: 28, heavySets: 3 },
  getup: { baseKg: 16, nextKg: 20, heavyReps: 4 },
};

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// safeGet / safeSet
// ---------------------------------------------------------------------------

describe("safeGet", () => {
  it("returns null for an absent key", () => {
    expect(safeGet("no-such-key")).toBeNull();
  });

  it("returns the stored string value", () => {
    localStorage.setItem("k", "hello");
    expect(safeGet("k")).toBe("hello");
  });

  it("returns null (does not throw) when localStorage.getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("security error");
    });
    expect(safeGet("k")).toBeNull();
  });
});

describe("safeSet", () => {
  it("returns true on success and persists the value", () => {
    expect(safeSet("k", "v")).toBe(true);
    expect(localStorage.getItem("k")).toBe("v");
  });

  it("returns false (does not throw) when localStorage.setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(safeSet("k", "v")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadSessions / saveSessions
// ---------------------------------------------------------------------------

describe("loadSessions", () => {
  it("returns null when the key is absent", () => {
    expect(loadSessions()).toBeNull();
  });

  it("round-trips a sessions array", () => {
    saveSessions([session]);
    expect(loadSessions()).toEqual([session]);
  });

  it("returns an empty array when stored as empty array", () => {
    saveSessions([]);
    expect(loadSessions()).toEqual([]);
  });

  it("returns null on corrupt JSON", () => {
    localStorage.setItem("kb:v1:sessions", "{invalid json");
    expect(loadSessions()).toBeNull();
  });

  it("returns null when stored value is not an array", () => {
    localStorage.setItem("kb:v1:sessions", JSON.stringify({ oops: true }));
    expect(loadSessions()).toBeNull();
  });

  it("returns null when array contains an element with invalid shape", () => {
    const bad = [{ kind: "swing", weightKg: "heavy", reps: 10, prescribedRestSec: 30 }];
    localStorage.setItem("kb:v1:sessions", JSON.stringify(bad));
    expect(loadSessions()).toBeNull();
  });

  it("accepts a session with optional actualRestSec on a WorkSet", () => {
    const withOptional: Session = {
      ...session,
      swings: [{ ...swingSet, actualRestSec: 28 }],
    };
    saveSessions([withOptional]);
    expect(loadSessions()).toEqual([withOptional]);
  });
});

describe("saveSessions", () => {
  it("returns true on success", () => {
    expect(saveSessions([session])).toBe(true);
  });

  it("returns false (does not throw) when setItem throws (quota simulation)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(saveSessions([session])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadSettings / saveSettings
// ---------------------------------------------------------------------------

describe("loadSettings", () => {
  it("returns null when absent", () => {
    expect(loadSettings()).toBeNull();
  });

  it("round-trips settings", () => {
    saveSettings(settings);
    expect(loadSettings()).toEqual(settings);
  });

  it("returns null for invalid shape", () => {
    localStorage.setItem("kb:v1:settings", JSON.stringify({ broken: true }));
    expect(loadSettings()).toBeNull();
  });

  it("returns null for corrupt JSON", () => {
    localStorage.setItem("kb:v1:settings", "not-json");
    expect(loadSettings()).toBeNull();
  });
});

describe("saveSettings", () => {
  it("returns true on success", () => {
    expect(saveSettings(settings)).toBe(true);
  });

  it("returns false (does not throw) on quota error", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(saveSettings(settings)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadProgression / saveProgression
// ---------------------------------------------------------------------------

describe("loadProgression", () => {
  it("returns null when absent", () => {
    expect(loadProgression()).toBeNull();
  });

  it("round-trips progression state", () => {
    saveProgression(progression);
    expect(loadProgression()).toEqual(progression);
  });

  it("returns null for invalid shape", () => {
    localStorage.setItem("kb:v1:progression", JSON.stringify({ broken: true }));
    expect(loadProgression()).toBeNull();
  });
});

describe("saveProgression", () => {
  it("returns true on success", () => {
    expect(saveProgression(progression)).toBe(true);
  });

  it("returns false (does not throw) on quota error", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(saveProgression(progression)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadAll
// ---------------------------------------------------------------------------

describe("loadAll", () => {
  it("returns empty sessions array and nulls when nothing is stored", () => {
    expect(loadAll()).toEqual({ sessions: [], settings: null, progression: null });
  });

  it("returns all slices when all are present", () => {
    saveSessions([session]);
    saveSettings(settings);
    saveProgression(progression);
    expect(loadAll()).toEqual({ sessions: [session], settings, progression });
  });

  it("returns empty sessions array (not null) when sessions key is absent", () => {
    saveSettings(settings);
    saveProgression(progression);
    const result = loadAll();
    expect(result.sessions).toEqual([]);
    expect(result.settings).toEqual(settings);
  });
});

// ---------------------------------------------------------------------------
// saveAll
// ---------------------------------------------------------------------------

describe("saveAll", () => {
  it("persists all slices and returns true", () => {
    const ok = saveAll({ sessions: [session], settings, progression });
    expect(ok).toBe(true);
    expect(loadSessions()).toEqual([session]);
    expect(loadSettings()).toEqual(settings);
    expect(loadProgression()).toEqual(progression);
  });

  it("returns false if any slice fails to write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(saveAll({ sessions: [], settings, progression })).toBe(false);
  });
});
