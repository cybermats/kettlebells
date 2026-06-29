import { describe, it, expect, beforeEach, vi } from "vitest";
import { exportAll, parseImport, clearAll, importReplaceAll, ImportError } from "./export-import";
import { loadSessions, loadSettings, loadProgression, saveSessions, saveSettings, saveProgression } from "./storage";
import type { Session, Settings, ProgressionState } from "../domain/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const session: Session = {
  id: "sess-1",
  date: "2026-06-01",
  swings: [{ kind: "swing", weightKg: 24, reps: 10, prescribedRestSec: 30 }],
  getups: [{ kind: "getup", weightKg: 16, reps: 1, prescribedRestSec: 60 }],
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
// exportAll
// ---------------------------------------------------------------------------

describe("exportAll", () => {
  it("produces valid JSON with schemaVersion and all slices", () => {
    const json = exportAll({ sessions: [session], settings, progression });
    const obj = JSON.parse(json) as Record<string, unknown>;
    expect(obj["schemaVersion"]).toBe(1);
    expect(obj["sessions"]).toEqual([session]);
    expect(obj["settings"]).toEqual(settings);
    expect(obj["progression"]).toEqual(progression);
  });

  it("produces valid JSON for an empty session list", () => {
    const json = exportAll({ sessions: [], settings, progression });
    const obj = JSON.parse(json) as Record<string, unknown>;
    expect(obj["sessions"]).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseImport — happy path
// ---------------------------------------------------------------------------

describe("parseImport — round-trip", () => {
  it("exportAll → parseImport returns equal data", () => {
    const state = { sessions: [session], settings, progression };
    const json = exportAll(state);
    const imported = parseImport(json);
    expect(imported.schemaVersion).toBe(1);
    expect(imported.sessions).toEqual([session]);
    expect(imported.settings).toEqual(settings);
    expect(imported.progression).toEqual(progression);
  });

  it("round-trips a session with optional fields (actualRestSec, swingBlockSec, notes)", () => {
    const rich: Session = {
      ...session,
      swings: [{ kind: "swing", weightKg: 24, reps: 10, prescribedRestSec: 30, actualRestSec: 27 }],
      swingBlockSec: 292,
      notes: "felt strong",
    };
    const json = exportAll({ sessions: [rich], settings, progression });
    const imported = parseImport(json);
    expect(imported.sessions[0]).toEqual(rich);
  });
});

// ---------------------------------------------------------------------------
// parseImport — rejection cases
// ---------------------------------------------------------------------------

describe("parseImport — malformed JSON", () => {
  it("throws ImportError for a completely invalid JSON string", () => {
    expect(() => parseImport("{not valid json")).toThrow(ImportError);
  });

  it("throws ImportError for an empty string", () => {
    expect(() => parseImport("")).toThrow(ImportError);
  });
});

describe("parseImport — wrong / unsupported schemaVersion", () => {
  it("throws ImportError for a future/unknown version", () => {
    const json = JSON.stringify({ schemaVersion: 999, sessions: [], settings, progression });
    expect(() => parseImport(json)).toThrow(ImportError);
  });

  it("throws ImportError for version 0 (pre-initial, no migration path)", () => {
    const json = JSON.stringify({ schemaVersion: 0, sessions: [], settings, progression });
    expect(() => parseImport(json)).toThrow(ImportError);
  });

  it("throws ImportError when schemaVersion is missing", () => {
    const json = JSON.stringify({ sessions: [], settings, progression });
    expect(() => parseImport(json)).toThrow(ImportError);
  });

  it("throws ImportError when schemaVersion is a string", () => {
    const json = JSON.stringify({ schemaVersion: "1", sessions: [], settings, progression });
    expect(() => parseImport(json)).toThrow(ImportError);
  });
});

describe("parseImport — invalid shape", () => {
  it("throws ImportError when sessions field is missing", () => {
    const json = JSON.stringify({ schemaVersion: 1, settings, progression });
    expect(() => parseImport(json)).toThrow(ImportError);
  });

  it("throws ImportError when settings has wrong shape", () => {
    const json = JSON.stringify({ schemaVersion: 1, sessions: [], settings: { broken: true }, progression });
    expect(() => parseImport(json)).toThrow(ImportError);
  });

  it("throws ImportError when progression is missing", () => {
    const json = JSON.stringify({ schemaVersion: 1, sessions: [], settings });
    expect(() => parseImport(json)).toThrow(ImportError);
  });

  it("throws ImportError when input is a JSON array (not object)", () => {
    expect(() => parseImport(JSON.stringify([]))).toThrow(ImportError);
  });

  it("throws ImportError when input is JSON null", () => {
    expect(() => parseImport(JSON.stringify(null))).toThrow(ImportError);
  });

  it("throws ImportError when a WorkSet in sessions has wrong kind", () => {
    const badSession = {
      ...session,
      swings: [{ kind: "run", weightKg: 24, reps: 10, prescribedRestSec: 30 }],
    };
    const json = JSON.stringify({ schemaVersion: 1, sessions: [badSession], settings, progression });
    expect(() => parseImport(json)).toThrow(ImportError);
  });
});

// ---------------------------------------------------------------------------
// clearAll
// ---------------------------------------------------------------------------

describe("clearAll", () => {
  it("removes all three kb:v1 keys", () => {
    saveSessions([session]);
    saveSettings(settings);
    saveProgression(progression);

    clearAll();

    expect(loadSessions()).toBeNull();
    expect(loadSettings()).toBeNull();
    expect(loadProgression()).toBeNull();
  });

  it("does not throw when keys are already absent", () => {
    expect(() => clearAll()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// importReplaceAll — happy path
// ---------------------------------------------------------------------------

describe("importReplaceAll — replace semantics", () => {
  it("replaces existing localStorage data with the imported data", () => {
    const oldSettings: Settings = { ...settings, ownedBellsKg: [12] };
    saveSessions([]);
    saveSettings(oldSettings);
    saveProgression(progression);

    const newState = { sessions: [session], settings, progression };
    importReplaceAll(exportAll(newState));

    expect(loadSessions()).toEqual([session]);
    expect(loadSettings()).toEqual(settings);
    expect(loadProgression()).toEqual(progression);
  });

  it("returns the imported PersistedState", () => {
    const state = { sessions: [session], settings, progression };
    const result = importReplaceAll(exportAll(state));
    expect(result.schemaVersion).toBe(1);
    expect(result.sessions).toEqual([session]);
    expect(result.settings).toEqual(settings);
    expect(result.progression).toEqual(progression);
  });

  it("handles importing an empty session list (clears history)", () => {
    saveSessions([session]);
    importReplaceAll(exportAll({ sessions: [], settings, progression }));
    expect(loadSessions()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// importReplaceAll — validate-first, no partial writes
// ---------------------------------------------------------------------------

describe("importReplaceAll — validate first, never partial write", () => {
  it("does NOT touch storage when JSON is malformed", () => {
    saveSessions([session]);
    saveSettings(settings);
    saveProgression(progression);

    expect(() => importReplaceAll("{bad json")).toThrow(ImportError);

    // Original data must still be intact.
    expect(loadSessions()).toEqual([session]);
    expect(loadSettings()).toEqual(settings);
    expect(loadProgression()).toEqual(progression);
  });

  it("does NOT touch storage when schemaVersion is unsupported", () => {
    saveSessions([session]);

    const badJson = JSON.stringify({
      schemaVersion: 999,
      sessions: [],
      settings,
      progression,
    });
    expect(() => importReplaceAll(badJson)).toThrow(ImportError);

    // Original sessions still intact.
    expect(loadSessions()).toEqual([session]);
  });

  it("does NOT touch storage when data shape is invalid", () => {
    saveSettings(settings);

    const badJson = JSON.stringify({
      schemaVersion: 1,
      sessions: "not-an-array",
      settings,
      progression,
    });
    expect(() => importReplaceAll(badJson)).toThrow(ImportError);

    expect(loadSettings()).toEqual(settings);
  });
});
