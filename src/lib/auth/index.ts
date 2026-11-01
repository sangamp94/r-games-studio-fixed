import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import argon2 from "argon2";
import { prisma } from "../prisma";
import { env } from "../env";

const SESSION_COOKIE_NAME = "rgames_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 1000 * 60 * 15; // 15 minutes

function hashToken(rawToken: string): string {
  return crypto.createHmac("sha256", env.SESSION_SECRET).update(rawToken).digest("hex");
}

export function hashVisitorIp(rawIp: string): string {
  const dayBucket = new Date().toISOString().slice(0, 10);
  return crypto
    .createHmac("sha256", env.VISITOR_HASH_SALT)
    .update(`${dayBucket}:${rawIp}`)
    .digest("hex");
}

export async function authenticateAdmin(email: string, plainPassword: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.adminUser.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    await argon2.hash(plainPassword, { type: argon2.argon2id });
    return { ok: false as const, reason: "invalid_credentials" as const };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false as const, reason: "locked" as const };
  }

  const passwordValid = await argon2.verify(user.passwordHash, plainPassword);
  if (!passwordValid) {
    const nextFailedCount = user.failedLoginCount + 1;
    const shouldLock = nextFailedCount >= MAX_FAILED_ATTEMPTS;

    await prisma.adminUser.update({
      where: { id: user.id },
      data: {
        failedLoginCount: nextFailedCount,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
      },
    });

    return {
      ok: false as const,
      reason: shouldLock ? ("locked" as const) : ("invalid_credentials" as const),
    };
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const reqHeaders = await headers();
  const userAgent = reqHeaders.get("user-agent") ?? undefined;
  const forwardedFor = reqHeaders.get("x-forwarded-for") ?? "127.0.0.1";
  const ipHash = hashVisitorIp(forwardedFor.split(",")[0].trim());

  await prisma.$transaction([
    prisma.adminUser.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    }),
    prisma.session.create({
      data: {
        adminUserId: user.id,
        tokenHash,
        userAgent,
        ipHash,
        expiresAt,
      },
    }),
    prisma.auditLog.create({
      data: {
        adminUserId: user.id,
        action: "admin.login",
        entityType: "AdminUser",
        entityId: user.id,
        metadata: { userAgent },
      },
    }),
  ]);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return { ok: true as const, user };
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) return null;

  const tokenHash = hashToken(rawToken);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { adminUser: true },
  });

  if (!session || session.expiresAt <= new Date()) {
    return null;
  }

  return session;
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }
  return session.adminUser;
}

export async function revokeCurrentSession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (rawToken) {
    await prisma.session.deleteMany({
      where: { tokenHash: hashToken(rawToken) },
    });
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}
