import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";

const demoRequestSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Invalid email address").max(200),
  organisation: z.string().min(1, "Organisation is required").max(200),
  message: z.string().max(2000).optional().default(""),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = demoRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Invalid request" },
        { status: 400 }
      );
    }

    const { name, email, organisation, message } = parsed.data;

    // Log demo request in audit trail
    await prisma.auditEntry.create({
      data: {
        userName: name,
        userRole: "public",
        type: "demo_request",
        description: `Demo request from ${name} <${email}> at ${organisation}`,
        target: "landing-page",
        detail: JSON.stringify({ name, email, organisation, message }),
      },
    });

    console.log(`[demo-request] New demo request from ${name} <${email}> at ${organisation}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[demo-request] Failed to process:", err);
    return NextResponse.json(
      { error: "Failed to process your request. Please try again." },
      { status: 500 }
    );
  }
}
