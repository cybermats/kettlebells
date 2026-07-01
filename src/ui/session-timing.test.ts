import { describe, it, expect } from "vitest";
import { blockDurationSec, remainingRestSec, activeSet } from "./session-timing";

describe("blockDurationSec", () => {
  it("returns null when the block has not started", () => {
    expect(blockDurationSec(null, null, 5000)).toBeNull();
    expect(blockDurationSec(null, 9000, 5000)).toBeNull();
  });

  it("reads live off nowMs while running (no end mark)", () => {
    expect(blockDurationSec(0, null, 134_000)).toBe(134); // 2:14
  });

  it("freezes at the end mark once recorded", () => {
    // nowMs advances past the end, but the frozen duration stays put.
    expect(blockDurationSec(1000, 61_000, 999_999)).toBe(60);
  });

  it("rounds to the nearest second", () => {
    expect(blockDurationSec(0, 30_400, 0)).toBe(30);
    expect(blockDurationSec(0, 30_600, 0)).toBe(31);
  });

  it("clamps out-of-order marks to zero", () => {
    expect(blockDurationSec(10_000, 4_000, 0)).toBe(0);
  });
});

describe("remainingRestSec", () => {
  it("is positive while still within the prescribed rest", () => {
    expect(remainingRestSec(30, 23_000)).toBe(7); // 0:07 left
  });

  it("is zero exactly at the prescribed rest", () => {
    expect(remainingRestSec(30, 30_000)).toBe(0);
  });

  it("goes negative once overdue", () => {
    expect(remainingRestSec(30, 35_000)).toBe(-5); // +0:05 over
  });
});

describe("activeSet", () => {
  const set = (done: boolean) => ({ done });

  it("selects the first not-done swing while swings remain", () => {
    const swings = [set(true), set(true), set(false), set(false)];
    const getups = [set(false)];
    const result = activeSet(swings, getups);
    expect(result).toEqual({ kind: "swing", index: 2, set: swings[2] });
  });

  it("crosses to the first get-up once all swings are done", () => {
    const swings = [set(true), set(true)];
    const getups = [set(false), set(false)];
    const result = activeSet(swings, getups);
    expect(result).toEqual({ kind: "getup", index: 0, set: getups[0] });
  });

  it("stays on get-ups mid-block", () => {
    const swings = [set(true)];
    const getups = [set(true), set(true), set(false)];
    const result = activeSet(swings, getups);
    expect(result).toEqual({ kind: "getup", index: 2, set: getups[2] });
  });

  it("returns null when the whole session is complete", () => {
    expect(activeSet([set(true)], [set(true), set(true)])).toBeNull();
  });

  it("selects swing 0 at the very start (nothing done yet)", () => {
    const swings = [set(false), set(false)];
    const getups = [set(false)];
    const result = activeSet(swings, getups);
    expect(result?.kind).toBe("swing");
    expect(result?.index).toBe(0);
  });
});
