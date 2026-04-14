import { describe, it, expect } from "vitest";
import { deadlineColor, addWorkingDays } from "../utils";

describe("deadlineColor", () => {
  describe("default thresholds (amber=10, red=5)", () => {
    it("returns urgent with bg for overdue", () => {
      expect(deadlineColor(-1)).toBe("text-deadline-urgent bg-red-50");
      expect(deadlineColor(-10)).toBe("text-deadline-urgent bg-red-50");
    });

    it("returns urgent for 0-5 days", () => {
      expect(deadlineColor(0)).toBe("text-deadline-urgent");
      expect(deadlineColor(5)).toBe("text-deadline-urgent");
    });

    it("returns warning for 6-10 days", () => {
      expect(deadlineColor(6)).toBe("text-deadline-warning");
      expect(deadlineColor(10)).toBe("text-deadline-warning");
    });

    it("returns safe for > 10 days", () => {
      expect(deadlineColor(11)).toBe("text-deadline-safe");
      expect(deadlineColor(30)).toBe("text-deadline-safe");
    });
  });

  describe("custom thresholds", () => {
    it("uses custom amber and red values", () => {
      const opts = { amberDays: 15, redDays: 7 };
      expect(deadlineColor(-1, opts)).toBe("text-deadline-urgent bg-red-50");
      expect(deadlineColor(0, opts)).toBe("text-deadline-urgent");
      expect(deadlineColor(7, opts)).toBe("text-deadline-urgent");
      expect(deadlineColor(8, opts)).toBe("text-deadline-warning");
      expect(deadlineColor(15, opts)).toBe("text-deadline-warning");
      expect(deadlineColor(16, opts)).toBe("text-deadline-safe");
    });

    it("handles amber=3, red=1", () => {
      const opts = { amberDays: 3, redDays: 1 };
      expect(deadlineColor(1, opts)).toBe("text-deadline-urgent");
      expect(deadlineColor(2, opts)).toBe("text-deadline-warning");
      expect(deadlineColor(3, opts)).toBe("text-deadline-warning");
      expect(deadlineColor(4, opts)).toBe("text-deadline-safe");
    });
  });
});

describe("addWorkingDays", () => {
  it("adds working days, skipping weekends", () => {
    // Monday 2025-01-06 + 5 working days = Monday 2025-01-13
    const start = new Date("2025-01-06");
    const result = addWorkingDays(start, 5);
    expect(result.toISOString().split("T")[0]).toBe("2025-01-13");
  });

  it("skips weekends when starting on Friday", () => {
    // Friday 2025-01-10 + 1 working day = Monday 2025-01-13
    const start = new Date("2025-01-10");
    const result = addWorkingDays(start, 1);
    expect(result.toISOString().split("T")[0]).toBe("2025-01-13");
  });

  it("handles 0 working days", () => {
    const start = new Date("2025-01-06");
    const result = addWorkingDays(start, 0);
    expect(result.toISOString().split("T")[0]).toBe("2025-01-06");
  });

  it("handles 20 working days (standard LGOIMA)", () => {
    // Monday 2025-01-06 + 20 working days = Monday 2025-02-03
    const start = new Date("2025-01-06");
    const result = addWorkingDays(start, 20);
    expect(result.toISOString().split("T")[0]).toBe("2025-02-03");
  });

  it("does not mutate the start date", () => {
    const start = new Date("2025-01-06");
    const original = start.toISOString();
    addWorkingDays(start, 10);
    expect(start.toISOString()).toBe(original);
  });
});
