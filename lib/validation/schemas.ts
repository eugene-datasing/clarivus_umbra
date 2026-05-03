/**
 * Zod runtime validation schemas for server action inputs.
 *
 * TypeScript interfaces only enforce types at compile time.  These schemas
 * provide runtime validation at the trust boundary between client and server.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Phase 12.1 (Umbra v2) — LGOIMA ground vocabulary dropped
// ---------------------------------------------------------------------------
//
// v1 validated `ground` fields against the canonical LGOIMA ground list. v2
// is a privacy-only redaction product with no statutory ground vocabulary,
// so the validation collapses to a bounded-length string. The `ground`
// field is kept on the input shape (deprecated) for client-payload
// backwards compatibility — it is ignored server-side, see the
// detection-actions accept/bulk paths.

const optionalGroundIdSchema = z
  .string()
  .max(30)
  .optional();

// ---------------------------------------------------------------------------
// Batch
// ---------------------------------------------------------------------------

export const createBatchSchema = z.object({
  name: z.string().min(1, "Batch name is required").max(80),
});

// ---------------------------------------------------------------------------
// Detection review
// ---------------------------------------------------------------------------

export const detectionIdSchema = z.string().min(1, "Detection ID is required");

export const acceptDetectionSchema = z.object({
  detectionId: detectionIdSchema,
  /** @deprecated Phase 5 — ignored server-side, kept for client schema compatibility. */
  ground: optionalGroundIdSchema,
});

export const rejectDetectionSchema = z.object({
  detectionId: detectionIdSchema,
  reason: z.string().max(2000).optional(),
});

export const bulkDetectionSchema = z.object({
  detectionIds: z.array(detectionIdSchema).min(1, "At least one detection is required").max(1000),
  /** @deprecated Phase 5 — ignored server-side. */
  ground: optionalGroundIdSchema,
});

export const confidenceThresholdSchema = z.object({
  batchId: z.string().min(1, "Batch ID is required"),
  threshold: z.number().int().min(0).max(100),
});

export const changeDetectionTypeSchema = z.object({
  detectionId: detectionIdSchema,
  newType: z.string().min(1, "Detection type is required").max(30),
});

export const acceptRemainingSchema = z.object({
  documentId: z.string().min(1, "Document ID is required"),
});

// ---------------------------------------------------------------------------
// Manual detection
// ---------------------------------------------------------------------------

export const createManualDetectionSchema = z.object({
  documentId: z.string().min(1, "Document ID is required"),
  text: z.string().min(1, "Detection text is required").max(5000),
  type: z.string().min(1, "Detection type is required").max(50),
  page: z.number().int().positive("Page must be a positive integer"),
  /** @deprecated Phase 5 — ignored server-side. */
  ground: optionalGroundIdSchema,
  reasoning: z.string().max(2000).optional(),
  note: z.string().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// Department
// ---------------------------------------------------------------------------

export const createDepartmentSchema = z.object({
  name: z.string().min(1, "Department name is required").max(200),
  contactEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  headName: z.string().max(200).optional(),
});

export const updateDepartmentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  contactEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  headName: z.string().max(200).optional(),
  isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Custom rules
// ---------------------------------------------------------------------------

export const createRuleSchema = z.object({
  name: z.string().min(1, "Rule name is required").max(200),
  type: z.enum(["Keyword", "Pattern", "Entity", "Combination"]),
  status: z.enum(["Active", "Draft", "Disabled"]),
  matchMode: z.enum(["Exact", "Fuzzy", "Regex"]),
  keywords: z.string().min(1, "Keywords are required").max(10000),
  scope: z.string().min(1).max(200),
  priority: z.enum(["Low", "Medium", "High", "Critical"]),
  /** Free-form reviewer note. Phase 8 replaces the Veil-era LGOIMA-ground field. */
  note: z.string().max(2000).optional(),
  description: z.string().max(2000).optional(),
});

export const updateRuleSchema = createRuleSchema.partial();
