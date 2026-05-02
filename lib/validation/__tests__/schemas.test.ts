import { describe, it, expect } from "vitest";
import {
  createBatchSchema,
  createManualDetectionSchema,
  createDepartmentSchema,
  createRuleSchema,
  acceptDetectionSchema,
  bulkDetectionSchema,
  rejectDetectionSchema,
  confidenceThresholdSchema,
  updateDepartmentSchema,
  updateRuleSchema,
} from "../schemas";

describe("createBatchSchema", () => {
  it("accepts a valid batch name", () => {
    expect(() => createBatchSchema.parse({ name: "May submission responses" })).not.toThrow();
  });

  it("rejects an empty name", () => {
    expect(() => createBatchSchema.parse({ name: "" })).toThrow();
  });

  it("rejects a name longer than 80 chars", () => {
    expect(() => createBatchSchema.parse({ name: "X".repeat(81) })).toThrow();
  });

  it("accepts a name at exactly 80 chars", () => {
    expect(() => createBatchSchema.parse({ name: "X".repeat(80) })).not.toThrow();
  });
});

describe("createManualDetectionSchema", () => {
  const valid = {
    documentId: "doc123",
    text: "John Smith",
    type: "Name",
    page: 1,
  };

  it("accepts valid data", () => {
    expect(() => createManualDetectionSchema.parse(valid)).not.toThrow();
  });

  it("rejects non-positive page", () => {
    expect(() =>
      createManualDetectionSchema.parse({ ...valid, page: 0 }),
    ).toThrow();
  });

  it("rejects empty text", () => {
    expect(() =>
      createManualDetectionSchema.parse({ ...valid, text: "" }),
    ).toThrow();
  });
});

describe("createDepartmentSchema", () => {
  it("accepts valid data", () => {
    expect(() =>
      createDepartmentSchema.parse({ name: "IT Department" }),
    ).not.toThrow();
  });

  it("accepts optional email as empty string", () => {
    expect(() =>
      createDepartmentSchema.parse({ name: "IT", contactEmail: "" }),
    ).not.toThrow();
  });

  it("rejects invalid email", () => {
    expect(() =>
      createDepartmentSchema.parse({ name: "IT", contactEmail: "not-email" }),
    ).toThrow();
  });
});

describe("createRuleSchema", () => {
  const valid = {
    name: "NHI Number",
    type: "Pattern" as const,
    status: "Active" as const,
    matchMode: "Regex" as const,
    keywords: "[A-Z]{3}\\d{4}",
    scope: "All Documents",
    priority: "High" as const,
  };

  it("accepts valid data", () => {
    expect(() => createRuleSchema.parse(valid)).not.toThrow();
  });

  it("rejects invalid type enum", () => {
    expect(() =>
      createRuleSchema.parse({ ...valid, type: "Invalid" }),
    ).toThrow();
  });

  it("rejects invalid matchMode enum", () => {
    expect(() =>
      createRuleSchema.parse({ ...valid, matchMode: "Invalid" }),
    ).toThrow();
  });
});

describe("acceptDetectionSchema", () => {
  it("accepts detectionId with optional ground", () => {
    expect(() =>
      acceptDetectionSchema.parse({ detectionId: "d1", ground: "s7(2)(a)" }),
    ).not.toThrow();
  });

  it("rejects empty detectionId", () => {
    expect(() =>
      acceptDetectionSchema.parse({ detectionId: "" }),
    ).toThrow();
  });
});

describe("bulkDetectionSchema", () => {
  it("accepts array of IDs", () => {
    expect(() =>
      bulkDetectionSchema.parse({ detectionIds: ["d1", "d2"] }),
    ).not.toThrow();
  });

  it("rejects empty array", () => {
    expect(() =>
      bulkDetectionSchema.parse({ detectionIds: [] }),
    ).toThrow();
  });

  it("accepts optional ground with IDs", () => {
    expect(() =>
      bulkDetectionSchema.parse({
        detectionIds: ["d1"],
        ground: "s7(2)(a)",
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Schemas not yet covered above
// ---------------------------------------------------------------------------

describe("rejectDetectionSchema", () => {
  it("accepts detectionId with optional reason", () => {
    expect(() =>
      rejectDetectionSchema.parse({ detectionId: "d1", reason: "False positive" }),
    ).not.toThrow();
  });

  it("accepts detectionId without reason", () => {
    expect(() =>
      rejectDetectionSchema.parse({ detectionId: "d1" }),
    ).not.toThrow();
  });

  it("rejects empty detectionId", () => {
    expect(() =>
      rejectDetectionSchema.parse({ detectionId: "" }),
    ).toThrow();
  });

  it("rejects reason longer than 2000 chars", () => {
    expect(() =>
      rejectDetectionSchema.parse({ detectionId: "d1", reason: "x".repeat(2001) }),
    ).toThrow();
  });
});

describe("confidenceThresholdSchema", () => {
  it("accepts valid batchId and threshold", () => {
    expect(() =>
      confidenceThresholdSchema.parse({ batchId: "c1", threshold: 85 }),
    ).not.toThrow();
  });

  it("accepts threshold of 0", () => {
    expect(() =>
      confidenceThresholdSchema.parse({ batchId: "c1", threshold: 0 }),
    ).not.toThrow();
  });

  it("accepts threshold of 100", () => {
    expect(() =>
      confidenceThresholdSchema.parse({ batchId: "c1", threshold: 100 }),
    ).not.toThrow();
  });

  it("rejects threshold above 100", () => {
    expect(() =>
      confidenceThresholdSchema.parse({ batchId: "c1", threshold: 101 }),
    ).toThrow();
  });

  it("rejects negative threshold", () => {
    expect(() =>
      confidenceThresholdSchema.parse({ batchId: "c1", threshold: -1 }),
    ).toThrow();
  });

  it("rejects non-integer threshold", () => {
    expect(() =>
      confidenceThresholdSchema.parse({ batchId: "c1", threshold: 85.5 }),
    ).toThrow();
  });

  it("rejects empty batchId", () => {
    expect(() =>
      confidenceThresholdSchema.parse({ batchId: "", threshold: 85 }),
    ).toThrow();
  });
});

describe("updateDepartmentSchema", () => {
  it("accepts partial update with just name", () => {
    expect(() =>
      updateDepartmentSchema.parse({ name: "Updated Dept" }),
    ).not.toThrow();
  });

  it("accepts partial update with isActive", () => {
    expect(() =>
      updateDepartmentSchema.parse({ isActive: false }),
    ).not.toThrow();
  });

  it("accepts empty object (all fields optional)", () => {
    expect(() =>
      updateDepartmentSchema.parse({}),
    ).not.toThrow();
  });

  it("rejects invalid email in update", () => {
    expect(() =>
      updateDepartmentSchema.parse({ contactEmail: "bad-email" }),
    ).toThrow();
  });

  it("accepts valid email in update", () => {
    expect(() =>
      updateDepartmentSchema.parse({ contactEmail: "admin@council.govt.nz" }),
    ).not.toThrow();
  });
});

describe("updateRuleSchema", () => {
  it("accepts partial updates", () => {
    expect(() =>
      updateRuleSchema.parse({ name: "Updated Rule Name" }),
    ).not.toThrow();
  });

  it("accepts empty object (all fields optional)", () => {
    expect(() =>
      updateRuleSchema.parse({}),
    ).not.toThrow();
  });

  it("still validates enum constraints on partial data", () => {
    expect(() =>
      updateRuleSchema.parse({ type: "InvalidType" }),
    ).toThrow();
  });

  it("accepts valid enum on partial update", () => {
    expect(() =>
      updateRuleSchema.parse({ status: "Disabled", priority: "Critical" }),
    ).not.toThrow();
  });
});


describe("createManualDetectionSchema — additional edge cases", () => {
  const valid = {
    documentId: "doc123",
    text: "John Smith",
    type: "Name",
    page: 1,
  };

  it("accepts optional ground", () => {
    expect(() =>
      createManualDetectionSchema.parse({ ...valid, ground: "s7(2)(a)" }),
    ).not.toThrow();
  });

  it("accepts optional reasoning", () => {
    expect(() =>
      createManualDetectionSchema.parse({ ...valid, reasoning: "Known personal name" }),
    ).not.toThrow();
  });

  it("rejects negative page number", () => {
    expect(() =>
      createManualDetectionSchema.parse({ ...valid, page: -1 }),
    ).toThrow();
  });

  it("rejects text exceeding 5000 chars", () => {
    expect(() =>
      createManualDetectionSchema.parse({ ...valid, text: "X".repeat(5001) }),
    ).toThrow();
  });
});
