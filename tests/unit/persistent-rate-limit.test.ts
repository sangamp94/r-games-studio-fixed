import { describe, expect, it } from "vitest";
import { checkPersistentRateLimit } from "../../src/lib/security/persistent-rate-limit";

describe("Persistent Rate Limiter Across Multiple Instances", () => {
  it("enforces maxRequests across two separate process/instance calls", async () => {
    const testKey = `test-ip-${crypto.randomUUID()}`;
    const config = { windowMs: 60_000, maxRequests: 3 };

    const r1 = await checkPersistentRateLimit(testKey, config);
    expect(r1.allowed).toBe(true);
    const r2 = await checkPersistentRateLimit(testKey, config);
    expect(r2.allowed).toBe(true);

    const r3 = await checkPersistentRateLimit(testKey, config);
    expect(r3.allowed).toBe(true);

    const r4 = await checkPersistentRateLimit(testKey, config);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });
});
