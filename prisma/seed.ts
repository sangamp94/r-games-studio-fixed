import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { env } from "../src/lib/env";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash(env.ADMIN_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  await prisma.adminUser.upsert({
    where: { email: env.ADMIN_EMAIL.toLowerCase() },
    update: {},
    create: {
      email: env.ADMIN_EMAIL.toLowerCase(),
      passwordHash,
      displayName: "Admin",
    },
  });

  await prisma.siteSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      siteName: env.SITE_NAME,
      tagline: "",
      heroHeadline: "",
      heroSubtext: "",
      aboutText: "",
      footerText: "",
      socialLinks: {},
      defaultSeoTitle: env.SITE_NAME,
      defaultSeoDescription: "",
      contactEmail: "",
    },
  });
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
