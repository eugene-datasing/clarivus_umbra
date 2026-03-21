import { describe, it, expect } from "vitest";
import {
  createCaseSchema,
  createManualDetectionSchema,
  createDepartmentSchema,
  createRuleSchema,
  acceptDetectionSchema,
  bulkDetectionSchema,
  rejectDetectionSchema,
  applyGroundSchema,
  confidenceThresholdSchema,
  updateDepartmentSchema,
  updateRuleSchema,
} from "../schemas";

describe("createCaseSchema", () => {
  const valid = {
    requesterName: "Jane Smith",
    requesterType: "individual",
    dateReceived: "2025-01-15",
    deadline: "2025-02-15",
    priority: "high",
    departments: ["Corporate Services"],
    description: "LGOIMA request for meeting minutes",
  };

  it("accepts valid data", () => {
    expect(() => createCaseSchema.parse(valid)).not.toThrow();
  });

  it("rejects empty requesterName", () => {
    expect(() =>
      createCaseSchema.parse({ ...valid, requesterName: "" }),
    ).toThrow();
  });

  it("rejects empty departments array", () => {
    expect(() =>
      createCaseSchema.parse({ ...valid, departments: [] }),
    ).toThrow();
  });

  it("rejects invalid dateReceived", () => {
    expect(() =>
      createCaseSchema.parse({ ...valid, dateReceived: "not-a-date" }),
    ).toThrow();
  });

  it("rejects missing description", () => {
    const { description, ...noDesc } = valid;
    expect(() => createCaseSchema.parse(noDesc)).toThrow();
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

describe("applyGroundSchema", () => {
  it("accepts valid detectionId and groundId", () => {
    expect(() =>
      applyGroundSchema.parse({ detectionId: "d1", groundId: "s7(2)(a)" }),
    ).not.toThrow();
  });

  it("rejects empty groundId", () => {
    expect(() =>
      applyGroundSchema.parse({ detectionId: "d1", groundId: "" }),
    ).toThrow();
  });

  it("rejects missing groundId", () => {
    expect(() =>
      applyGroundSchema.parse({ detectionId: "d1" }),
    ).toThrow();
  });

  it("rejects groundId longer than 30 chars", () => {
    expect(() =>
      applyGroundSchema.parse({ detectionId: "d1", groundId: "a".repeat(31) }),
    ).toThrow();
  });
});

describe("confidenceThresholdSchema", () => {
  it("accepts valid caseId and threshold", () => {
    expect(() =>
      confidenceThresholdSchema.parse({ caseId: "c1", threshold: 85 }),
    ).not.toThrow();
  });

  it("accepts threshold of 0", () => {
    expect(() =>
      confidenceThresholdSchema.parse({ caseId: "c1", threshold: 0 }),
    ).not.toThrow();
  });

  it("accepts threshold of 100", () => {
    expect(() =>
      confidenceThresholdSchema.parse({ caseId: "c1", threshold: 100 }),
    ).not.toThrow();
  });

  it("rejects threshold above 100", () => {
    expect(() =>
      confidenceThresholdSchema.parse({ caseId: "c1", threshold: 101 }),
    ).toThrow();
  });

  it("rejects negative threshold", () => {
    expect(() =>
      confidenceThresholdSchema.parse({ caseId: "c1", threshold: -1 }),
    ).toThrow();
  });

  it("rejects non-integer threshold", () => {
    expect(() =>
      confidenceThresholdSchema.parse({ caseId: "c1", threshold: 85.5 }),
    ).toThrow();
  });

  it("rejects empty caseId", () => {
    expect(() =>
      confidenceThresholdSchema.parse({ caseId: "", threshold: 85 }),
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

describe("createCaseSchema — additional edge cases", () => {
  const valid = {
    requesterName: "Jane Smith",
    requesterType: "individual",
    dateReceived: "2025-01-15",
    deadline: "2025-02-15",
    priority: "high",
    departments: ["Corporate Services"],
    description: "LGOIMA request for meeting minutes",
  };

  it("rejects requesterName exceeding 200 chars", () => {
    expect(() =>
      createCaseSchema.parse({ ...valid, requesterName: "X".repeat(201) }),
    ).toThrow();
  });

  it("rejects description exceeding 10000 chars", () => {
    expect(() =>
      createCaseSchema.parse({ ...valid, description: "X".repeat(10001) }),
    ).toThrow();
  });

  it("accepts description at exactly 10000 chars", () => {
    expect(() =>
      createCaseSchema.parse({ ...valid, description: "X".repeat(10000) }),
    ).not.toThrow();
  });

  it("accepts ISO date format for dateReceived", () => {
    expect(() =>
      createCaseSchema.parse({ ...valid, dateReceived: "2025-12-31T23:59:59.000Z" }),
    ).not.toThrow();
  });

  it("rejects departments with empty string entries", () => {
    expect(() =>
      createCaseSchema.parse({ ...valid, departments: [""] }),
    ).toThrow();
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
