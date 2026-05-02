/**
 * Standalone E2E seed script — run via `npx tsx e2e/seed-test-users.ts`
 *
 * Creates Umbra test users with bcrypt-hashed passwords directly in the
 * database. Phase 9 dropped the Department concept; users carry only
 * `role` (admin / reviewer).
 */

import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { TEST_USERS } from "./fixtures/test-data";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://umbra:umbra_dev@localhost:5434/umbra";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("[e2e] Seeding test users...");

  for (const u of Object.values(TEST_USERS)) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        passwordHash,
        isActive: true,
      },
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash,
        isActive: true,
      },
    });
    console.log(`  ✓ ${u.email} (${u.role})`);
  }

  console.log("[e2e] Seed complete.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("[e2e] Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
