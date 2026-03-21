/**
 * Generate an activation code for a Veil deployment.
 *
 * Usage:
 *   DATABASE_URL="postgresql://veil:veil_dev@localhost:5434/veil" npx tsx scripts/generate-activation-code.ts \
 *     --org-name "New Plymouth District Council" \
 *     --org-abbr "NPDC" \
 *     --tenant-id "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" \
 *     --domain "npdc.govt.nz" \
 *     [--expires-days 90]
 *
 * Generates a VEIL-XXXX-XXXX-XXXX code, stores the bcrypt hash in the
 * activation_codes table, and prints the plaintext code to stdout.
 *
 * The printed code is the only copy — it is never stored in plaintext.
 */

import { generateActivationCode } from "../lib/data/activation";
import { prisma } from "../lib/db/prisma";

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return undefined;
}

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  const orgName = getFlag(args, "--org-name");
  const orgAbbr = getFlag(args, "--org-abbr");
  const tenantId = getFlag(args, "--tenant-id");
  const domain = getFlag(args, "--domain");

  let expiresInDays: number | undefined;
  const expiresStr = getFlag(args, "--expires-days");
  if (expiresStr) {
    expiresInDays = parseInt(expiresStr, 10);
    if (isNaN(expiresInDays) || expiresInDays <= 0) {
      console.error("Error: --expires-days must be a positive integer");
      process.exit(1);
    }
  }

  const { code, id, revokedCount } = await generateActivationCode({
    expiresInDays,
    revokeExisting: true,
    orgName,
    orgAbbreviation: orgAbbr,
    orgTenantId: tenantId,
    allowedDomain: domain,
  });

  if (revokedCount > 0) {
    console.log(`Revoked ${revokedCount} existing pending code(s).`);
  }

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : undefined;

  console.log("");
  console.log("=== Activation Code Generated ===");
  console.log("");
  console.log(`  Code:    ${code}`);
  console.log(`  ID:      ${id}`);
  if (orgName) console.log(`  Org:     ${orgName}${orgAbbr ? ` (${orgAbbr})` : ""}`);
  if (tenantId) console.log(`  Tenant:  ${tenantId}`);
  if (domain) console.log(`  Domain:  ${domain}`);
  if (expiresAt) {
    console.log(`  Expires: ${expiresAt.toISOString()}`);
  } else {
    console.log("  Expires: Never");
  }
  console.log("");
  console.log("Deliver this code to the client. It is not stored in plaintext.");
  console.log("");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Failed to generate activation code:", err);
  process.exit(1);
});
