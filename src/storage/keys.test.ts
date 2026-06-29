import { describe, it, expect } from "vitest";
import { SESSIONS_KEY, SETTINGS_KEY, PROGRESSION_KEY, SCHEMA_VERSION } from "./keys";

describe("keys", () => {
  it("SCHEMA_VERSION is 1", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });

  it("SESSIONS_KEY is the namespaced versioned string", () => {
    expect(SESSIONS_KEY).toBe("kb:v1:sessions");
  });

  it("SETTINGS_KEY is the namespaced versioned string", () => {
    expect(SETTINGS_KEY).toBe("kb:v1:settings");
  });

  it("PROGRESSION_KEY is the namespaced versioned string", () => {
    expect(PROGRESSION_KEY).toBe("kb:v1:progression");
  });

  it("all keys embed SCHEMA_VERSION", () => {
    expect(SESSIONS_KEY).toContain(`v${SCHEMA_VERSION}`);
    expect(SETTINGS_KEY).toContain(`v${SCHEMA_VERSION}`);
    expect(PROGRESSION_KEY).toContain(`v${SCHEMA_VERSION}`);
  });
});
