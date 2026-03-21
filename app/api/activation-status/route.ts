import { NextResponse } from "next/server";
import { isActivated } from "@/lib/data/activation";

/**
 * GET /api/activation-status
 *
 * Lightweight endpoint returning { activated: boolean }.
 * Required by the client-deployment-activation spec for edge middleware
 * checks and client-side polling after activation.
 *
 * No authentication required — the boolean itself is not sensitive.
 */
export async function GET() {
  const activated = await isActivated();
  return NextResponse.json({ activated });
}
