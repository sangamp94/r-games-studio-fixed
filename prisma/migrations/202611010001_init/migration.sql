CREATE TABLE "AdminUser" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userAgent" TEXT,
  "ipHash" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_adminUserId_idx" ON "Session"("adminUserId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
ALTER TABLE "Session" ADD CONSTRAINT "Session_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_adminUserId_idx" ON "AuditLog"("adminUserId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SiteSettings" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "siteName" TEXT NOT NULL,
  "tagline" TEXT NOT NULL DEFAULT '',
  "heroHeadline" TEXT NOT NULL DEFAULT '',
  "heroSubtext" TEXT NOT NULL DEFAULT '',
  "aboutText" TEXT NOT NULL DEFAULT '',
  "footerText" TEXT NOT NULL DEFAULT '',
  "socialLinks" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "defaultSeoTitle" TEXT NOT NULL DEFAULT '',
  "defaultSeoDescription" TEXT NOT NULL DEFAULT '',
  "contactEmail" TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RateLimitBucket" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "reset_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "RateLimitBucket_reset_at_idx" ON "RateLimitBucket"("reset_at");
