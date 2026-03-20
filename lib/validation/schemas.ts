/**
 * Zod runtime validation schemas for server action inputs.
 *
 * TypeScript interfaces only enforce types at compile time.  These schemas
 * provide runtime validation at the trust boundary between client and server.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Case
// ---------------------------------------------------------------------------

export const createCaseSchema = z.object({
  requesterName: z.string().min(1, "Requester name is required").max(200),
  requesterType: z.string().min(1).max(50),
  dateReceived: z.string().refine((s) => !isNaN(Date.parse(s)), "Invalid date"),
  deadline: z.string().refine((s) => !isNaN(Date.parse(s)), "Invalid date"),
  priority: z.string().min(1).max(20),
  departments: z.array(z.string().min(1)).min(1, "At least one department is required"),
  description: z.string().min(1, "Description is required").max(10000),
});

// ---------------------------------------------------------------------------
// Detection review
// ---------------------------------------------------------------------------

export const detectionIdSchema = z.string().min(1, "Detection ID is required");

export const acceptDetectionSchema = z.object({
  detectionId: detectionIdSchema,
  ground: z.string().max(30).optional(),
});

export const rejectDetectionSchema = z.object({
  detectionId: detectionIdSchema,
  reason: z.string().max(2000).optional(),
});

export const applyGroundSchema = z.object({
  detectionId: detectionIdSchema,
  groundId: z.string().min(1, "Ground is required").max(30),
});

export const bulkDetectionSchema = z.object({
  detectionIds: z.array(detectionIdSchema).min(1, "At least one detection is required").max(1000),
  ground: z.string().max(30).optional(),
});

// ---------------------------------------------------------------------------
// Manual detection
// ---------------------------------------------------------------------------

export const createManualDetectionSchema = z.object({
  documentId: z.string().min(1, "Document ID is required"),
  text: z.string().min(1, "Detection text is required").max(5000),
  type: z.string().min(1, "Detection type is required").max(50),
  page: z.number().int().positive("Page must be a positive integer"),
  ground: z.string().max(30).optional(),
  reasoning: z.string().max(2000).optional(),
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
  priority: z.enum(["Low", "Medium", "High"]),
  suggestedGround: z.string().max(30).optional(),
  description: z.string().max(2000).optional(),
});

export const updateRuleSchema = createRuleSchema.partial();
