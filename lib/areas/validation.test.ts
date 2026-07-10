import { describe, it, expect } from "vitest";
import { isValidAreaCapacityRange } from "./validation";

describe("isValidAreaCapacityRange", () => {
  it("rejects max lower than min", () => {
    expect(isValidAreaCapacityRange(3, 1)).toBe(false);
  });

  it("accepts max equal to min", () => {
    expect(isValidAreaCapacityRange(2, 2)).toBe(true);
  });

  it("accepts max greater than min", () => {
    expect(isValidAreaCapacityRange(1, 3)).toBe(true);
  });

  it("accepts a missing min (no lower bound)", () => {
    expect(isValidAreaCapacityRange(null, 1)).toBe(true);
  });

  it("accepts a missing max (unlimited)", () => {
    expect(isValidAreaCapacityRange(3, null)).toBe(true);
  });

  it("accepts both missing", () => {
    expect(isValidAreaCapacityRange(null, null)).toBe(true);
  });
});
