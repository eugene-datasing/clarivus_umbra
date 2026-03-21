import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit } from "../rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first request", () => {
    const result = checkRateLimit("test-key-1", {
      windowMs: 60_000,
      maxRequests: 5,
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("counts down remaining requests", () => {
    const config = { windowMs: 60_000, maxRequests: 3 };

    const r1 = checkRateLimit("test-key-2", config);
    expect(r1.remaining).toBe(2);

    const r2 = checkRateLimit("test-key-2", config);
    expect(r2.remaining).toBe(1);

    const r3 = checkRateLimit("test-key-2", config);
    expect(r3.remaining).toBe(0);
  });

  it("denies requests when limit is reached", () => {
    const config = { windowMs: 60_000, maxRequests: 2 };

    checkRateLimit("test-key-3", config);
    checkRateLimit("test-key-3", config);

    const r3 = checkRateLimit("test-key-3", config);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("provides retryAfterMs when denied", () => {
    const config = { windowMs: 60_000, maxRequests: 1 };

    checkRateLimit("test-key-4", config);

    const r2 = checkRateLimit("test-key-4", config);
    expect(r2.allowed).toBe(false);
    expect(r2.retryAfterMs).toBeDefined();
    expect(r2.retryAfterMs!).toBeGreaterThan(0);
    expect(r2.retryAfterMs!).toBeLessThanOrEqual(60_000);
  });

  it("resets after the window expires", () => {
    const config = { windowMs: 10_000, maxRequests: 1 };

    checkRateLimit("test-key-5", config);

    // Advance time past the window
    vi.advanceTimersByTime(11_000);

    const r2 = checkRateLimit("test-key-5", config);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(0);
  });

  it("tracks different keys independently", () => {
    const config = { windowMs: 60_000, maxRequests: 1 };

    checkRateLimit("user-A", config);
    const rA = checkRateLimit("user-A", config);
    expect(rA.allowed).toBe(false);

    const rB = checkRateLimit("user-B", config);
    expect(rB.allowed).toBe(true);
  });

  it("allows requests at exactly the max", () => {
    const config = { windowMs: 60_000, maxRequests: 3 };

    const r1 = checkRateLimit("test-key-6", config);
    const r2 = checkRateLimit("test-key-6", config);
    const r3 = checkRateLimit("test-key-6", config);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("uses default config when none provided", () => {
    // Default: 60 requests per 60s window
    const result = checkRateLimit("test-key-defaults");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);
  });
});
