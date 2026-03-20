import { describe, it, expect } from "vitest";
import {
  createCaseSchema,
  createManualDetectionSchema,
  createDepartmentSchema,
  createRuleSchema,
  acceptDetectionSchema,
  bulkDetectionSchema,
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
});
