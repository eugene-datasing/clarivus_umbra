/**
 * Standalone E2E seed script — run via `npx tsx e2e/seed-test-users.ts`
 *
 * Creates test users with bcrypt-hashed passwords directly in the database.
 * This runs outside the app process so it doesn't require middleware changes.
 */

import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { TEST_USERS } from "./fixtures/test-data";

const connectionString =
  process.env.DATABASE_URL || "postgresql://veil:veil_dev@localhost:5434/veil";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Department names that match case.departments arrays from prisma/seed.ts
const DEPT_NAMES: Record<string, string> = {
  "dept-001": "Infrastructure",
  "dept-002": "Planning",
  "dept-003": "Legal",
};

async function main() {
  console.log("[e2e] Seeding test users...");

  // Ensure departments exist
  const deptIds = [
    ...new Set(
      Object.values(TEST_USERS)
        .map((u) => u.departmentId)
        .filter(Boolean),
    ),
  ];
  for (const deptId of deptIds) {
    await prisma.department.upsert({
      where: { id: deptId },
      update: {},
      create: { id: deptId, name: DEPT_NAMES[deptId] ?? `Department ${deptId}` },
    });
    console.log(`  ✓ Department ${deptId} (${DEPT_NAMES[deptId]})`);
  }

  // Create/update test users
  for (const u of Object.values(TEST_USERS)) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        passwordHash,
        isActive: true,
        departmentId: u.departmentId ?? null,
      },
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash,
        isActive: true,
        departmentId: u.departmentId ?? null,
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
