import { describe, it, expect } from "vitest";
import { migrate, isCurrentVersion, UnsupportedSchemaError } from "./migrations";
import type { PersistedState } from "../domain/types";

// ---------------------------------------------------------------------------
// Fixture: a well-formed v1 blob
// ---------------------------------------------------------------------------

const validV1: PersistedState = {
  schemaVersion: 1,
  sessions: [
    {
      id: "s1",
      date: "2026-01-01",
      swings: [{ kind: "swing", weightKg: 24, reps: 10, prescribedRestSec: 30 }],
      getups: [{ kind: "getup", weightKg: 16, reps: 1, prescribedRestSec: 60 }],
    },
  ],
  settings: {
    ownedBellsKg: [16, 24, 32],
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
    swing: { baseKg: 24, nextKg: 28, heavySets: 0 },
    getup: { baseKg: 16, nextKg: 20, heavyReps: 0 },
  },
};

// ---------------------------------------------------------------------------
// migrate
// ---------------------------------------------------------------------------

describe("migrate — valid v1 data", () => {
  it("returns a valid PersistedState unchanged when already at current version", () => {
    expect(migrate(validV1)).toEqual(validV1);
  });

  it("accepts sessions with optional WorkSet fields present", () => {
    const withOptional: PersistedState = {
      ...validV1,
      sessions: [
        {
          ...validV1.sessions[0]!,
          swings: [{ kind: "swing", weightKg: 24, reps: 10, prescribedRestSec: 30, actualRestSec: 28 }],
          swingBlockSec: 295,
          notes: "felt good",
        },
      ],
    };
    expect(migrate(withOptional)).toEqual(withOptional);
  });
});

describe("migrate — unsupported / unrecognised versions", () => {
  it("throws UnsupportedSchemaError for a future version", () => {
    expect(() => migrate({ ...validV1, schemaVersion: 99 })).toThrow(UnsupportedSchemaError);
  });

  it("throws UnsupportedSchemaError for version 0 (before initial version)", () => {
    expect(() => migrate({ ...validV1, schemaVersion: 0 })).toThrow(UnsupportedSchemaError);
  });

  it("throws UnsupportedSchemaError when schemaVersion is missing", () => {
    const { schemaVersion: _removed, ...noVersion } = validV1;
    expect(() => migrate(noVersion)).toThrow(UnsupportedSchemaError);
  });

  it("throws UnsupportedSchemaError when schemaVersion is a string", () => {
    expect(() => migrate({ ...validV1, schemaVersion: "1" })).toThrow(UnsupportedSchemaError);
  });

  it("error message mentions the unsupported version number", () => {
    try {
      migrate({ ...validV1, schemaVersion: 42 });
    } catch (err) {
      expect(err).toBeInstanceOf(UnsupportedSchemaError);
      expect((err as UnsupportedSchemaError).message).toContain("42");
      expect((err as UnsupportedSchemaError).version).toBe(42);
    }
  });
});

describe("migrate — non-object inputs", () => {
  it("throws when input is null", () => {
    expect(() => migrate(null)).toThrow();
  });

  it("throws when input is a string", () => {
    expect(() => migrate("some string")).toThrow();
  });

  it("throws when input is a number", () => {
    expect(() => migrate(42)).toThrow();
  });

  it("throws when input is an array", () => {
    expect(() => migrate([])).toThrow();
  });
});

describe("migrate — invalid shape at current version", () => {
  it("throws when sessions is not an array", () => {
    expect(() =>
      migrate({ ...validV1, sessions: "not-an-array" }),
    ).toThrow();
  });

  it("throws when settings is missing required fields", () => {
    expect(() =>
      migrate({ ...validV1, settings: { broken: true } }),
    ).toThrow();
  });

  it("throws when progression is null", () => {
    expect(() =>
      migrate({ ...validV1, progression: null }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// isCurrentVersion
// ---------------------------------------------------------------------------

describe("isCurrentVersion", () => {
  it("returns true for schemaVersion 1 (current)", () => {
    expect(isCurrentVersion({ schemaVersion: 1 })).toBe(true);
  });

  it("returns false for a future version", () => {
    expect(isCurrentVersion({ schemaVersion: 2 })).toBe(false);
  });

  it("returns false for version 0", () => {
    expect(isCurrentVersion({ schemaVersion: 0 })).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isCurrentVersion(null)).toBe(false);
    expect(isCurrentVersion("string")).toBe(false);
    expect(isCurrentVersion(42)).toBe(false);
    expect(isCurrentVersion(undefined)).toBe(false);
  });

  it("returns false when schemaVersion is a string '1'", () => {
    expect(isCurrentVersion({ schemaVersion: "1" })).toBe(false);
  });
});
