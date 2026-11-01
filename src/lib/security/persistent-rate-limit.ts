import { prisma } from "@/prisma";

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const DRIVER = process.env.RATE_LIMIT_DRIVER ?? "postgres";

export async function checkPersistentRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  const now = Date.now();
  const resetAt = new Date(now + config.windowMs);

  if (DRIVER === "redis" && process.env.UPSTASH_REDIS_REST_URL) {
    const url = `${process.env.UPSTASH_REDIS_REST_URL}/pipeline`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["PEXPIRE", key, config.windowMs, "NX"],
        ["PTTL", key],
      ]),
    });
    const data = await res.json();
    const count = data[0]?.result ?? 1;
    const ttlMs = data[2]?.result ?? config.windowMs;
    const allowed = count <= config.maxRequests;
    return {
      allowed,
      remaining: Math.max(0, config.maxRequests - count),
      retryAfterSeconds: Math.ceil(ttlMs / 1000),
    };
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw\`
      DELETE FROM "RateLimitBucket" WHERE key = \${key} AND reset_at <= \${new Date(now)}
    \`;

    const existing = await tx.$queryRaw<{ count: number; reset_at: Date }[]>\`
      SELECT count, reset_at FROM "RateLimitBucket" WHERE key = \${key} FOR UPDATE
    \`;

    if (existing.length === 0) {
      await tx.$executeRaw\`
        INSERT INTO "RateLimitBucket" (key, count, reset_at) VALUES (\${key}, 1, \${resetAt})
      \`;
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        retryAfterSeconds: Math.ceil(config.windowMs / 1000),
      };
    }

    const currentCount = existing[0].count;
    const currentReset = existing[0].reset_at.getTime();

    if (currentCount >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((currentReset - now) / 1000)),
      };
    }

    await tx.$executeRaw\`
      UPDATE "RateLimitBucket" SET count = count + 1 WHERE key = \${key}
    \`;

    return {
      allowed: true,
      remaining: config.maxRequests - (currentCount + 1),
      retryAfterSeconds: Math.max(1, Math.ceil((currentReset - now) / 1000)),
    };
  });
}
