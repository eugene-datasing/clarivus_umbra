/**
 * reset-instance.ts — Wipe the entire Veil instance back to a
 * "just deployed, never activated" state.
 *
 * What it does:
 *   1. Truncates ALL tables (CASCADE) except _prisma_migrations
 *   2. Clears the local uploads directory
 *   3. Generates a fresh activation code and prints it to the console
 *
 * After running, the app will show the /activate page on next visit.
 *
 * Usage:
 *   DATABASE_URL="postgresql://veil:veil_dev@localhost:5434/veil" npx tsx scripts/reset-instance.ts
 *
 * Options:
 *   --org-name "New Plymouth District Council"   Pre-populate org name on the code
 *   --org-abbr "NPDC"                            Pre-populate org abbreviation
 *   --skip-uploads                               Don't clear the uploads directory
 */

import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}
const hasFlag = (flag: string) => args.includes(flag);

const orgName = getArg("--org-name") ?? "New Plymouth District Council";
const orgAbbr = getArg("--org-abbr") ?? "NPDC";
const skipUploads = hasFlag("--skip-uploads");

// ---------------------------------------------------------------------------
// Prisma setup
// ---------------------------------------------------------------------------
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERROR: DATABASE_URL is required.");
  process.exit(1);
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Activation code generator (standalone — doesn't depend on lib/data/activation)
// ---------------------------------------------------------------------------
const SAFE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function generateCode(): string {
  const bytes = crypto.randomBytes(12);
  const chars: string[] = [];
  for (let i = 0; i < 12; i++) {
    chars.push(SAFE_CHARS[bytes[i] % SAFE_CHARS.length]);
  }
  return `VEIL-${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("\n======================================");
  console.log("  VEIL INSTANCE RESET");
  console.log("  Wiping all data back to factory state");
  console.log("======================================\n");

  // Step 1: Discover all tables (except Prisma migrations)
  const tables: { tablename: string }[] = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename != '_prisma_migrations'
  `;

  const tableNames = tables.map((t) => t.tablename);
  console.log(`Found ${tableNames.length} tables: ${tableNames.join(", ")}\n`);

  // Step 2: Truncate all tables with CASCADE
  if (tableNames.length > 0) {
    const quoted = tableNames.map((t) => `"${t}"`).join(", ");
    const sql = `TRUNCATE TABLE ${quoted} CASCADE`;
    console.log("Truncating all tables...");
    await prisma.$executeRawUnsafe(sql);
    console.log("  Done - all tables truncated\n");
  }

  // Step 3: Clear uploads directory
  if (!skipUploads) {
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    if (fs.existsSync(uploadsDir)) {
      console.log(`Clearing uploads directory: ${uploadsDir}`);
      fs.rmSync(uploadsDir, { recursive: true, force: true });
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log("  Done - uploads cleared\n");
    } else {
      console.log("  No uploads directory found (skipping)\n");
    }
  } else {
    console.log("  Skipping uploads clear (--skip-uploads)\n");
  }

  // Step 4: Generate a fresh activation code
  const code = generateCode();
  const normalised = code.toUpperCase().replace(/\s/g, "");
  const codeHash = await bcrypt.hash(normalised, 12);

  await prisma.activationCode.create({
    data: {
      codeHash,
      status: "pending",
      orgName,
      orgAbbreviation: orgAbbr,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    },
  });

  console.log("Fresh activation code generated:");
  console.log("--------------------------------------");
  console.log(`  Code:    ${code}`);
  console.log("--------------------------------------");
  console.log(`  Org:     ${orgName} (${orgAbbr})`);
  console.log(`  Expires: 90 days\n`);

  // Verify: count rows in key tables
  console.log("Verification - row counts:");
  for (const table of ["users", "cases", "documents", "system_settings", "activation_codes"]) {
    if (tableNames.includes(table)) {
      const result: { c: bigint }[] = await prisma.$queryRawUnsafe(
        `SELECT count(*) as c FROM "${table}"`
      );
      console.log(`  ${table}: ${result[0].c.toString()}`);
    }
  }

  console.log("\nInstance reset complete.");
  console.log("  The app will show the /activate page on next visit.");
  console.log("  Make sure SKIP_ACTIVATION is NOT set to 'true' in .env\n");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Reset failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
