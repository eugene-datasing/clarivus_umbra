import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/authorize";
import { getStorage } from "@/lib/storage";
import { getOrgBranding } from "@/lib/data/org-config";
import { setSetting, SETTING_KEYS } from "@/lib/data/settings";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
]);

/**
 * GET /api/logo — serve the organisation logo.
 */
export async function GET() {
  const branding = await getOrgBranding();
  if (!branding.logoStorageKey) {
    return NextResponse.json({ error: "No logo configured" }, { status: 404 });
  }

  const storage = getStorage();
  const exists = await storage.exists(branding.logoStorageKey);
  if (!exists) {
    return NextResponse.json({ error: "Logo file not found" }, { status: 404 });
  }

  const data = await storage.download(branding.logoStorageKey);
  const ext = branding.logoStorageKey.split(".").pop();
  const contentType = ext === "png" ? "image/png" : "image/jpeg";

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

/**
 * POST /api/logo — upload a new organisation logo.
 */
export async function POST(request: NextRequest) {
  const user = await requireUser();
  await requireAdmin(user);

  const formData = await request.formData();
  const file = formData.get("logo") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File exceeds 2 MB limit" }, { status: 400 });
  }

  const ext = ALLOWED_TYPES.get(file.type);
  if (!ext) {
    return NextResponse.json(
      { error: "Only PNG and JPEG files are accepted" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = `branding/logo.${ext}`;
  const storage = getStorage();

  // Delete previous logo if it exists under a different extension
  const branding = await getOrgBranding();
  if (branding.logoStorageKey && branding.logoStorageKey !== storageKey) {
    try {
      await storage.delete(branding.logoStorageKey);
    } catch {
      // Ignore — old file may already be gone
    }
  }

  await storage.upload(storageKey, buffer, file.type);
  await setSetting(
    SETTING_KEYS.ORG_BRANDING,
    { ...branding, logoStorageKey: storageKey },
    user.name,
  );

  return NextResponse.json({ success: true, storageKey });
}

/**
 * DELETE /api/logo — remove the organisation logo.
 */
export async function DELETE() {
  const user = await requireUser();
  await requireAdmin(user);

  const branding = await getOrgBranding();
  if (branding.logoStorageKey) {
    const storage = getStorage();
    try {
      await storage.delete(branding.logoStorageKey);
    } catch {
      // Ignore
    }
    await setSetting(
      SETTING_KEYS.ORG_BRANDING,
      { ...branding, logoStorageKey: "" },
      user.name,
    );
  }

  return NextResponse.json({ success: true });
}
