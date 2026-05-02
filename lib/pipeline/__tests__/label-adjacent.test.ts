import { describe, it, expect } from "vitest";
import { detectLabelAdjacent, type LabelAdjacentMatch } from "../label-adjacent";
import type { ExtractedPage } from "../extract";

function makePage(pageNumber: number, text: string): ExtractedPage {
  return { pageNumber, text, words: [] };
}

function firstMatch(
  matches: LabelAdjacentMatch[],
  type: string,
): LabelAdjacentMatch | undefined {
  return matches.find((m) => m.type === type);
}

describe("detectLabelAdjacent", () => {
  // ---------------------------------------------------------------------
  // Positive cases — one per label family × a couple of separator shapes
  // ---------------------------------------------------------------------
  describe("DOB family", () => {
    it("matches 'Date of birth: 14 June 1983'", () => {
      const matches = detectLabelAdjacent([makePage(1, "Date of birth: 14 June 1983")]);
      expect(firstMatch(matches, "personal-name")?.text).toBe("14 June 1983");
    });

    it("matches 'DOB | 3 November 1978' (pipe separator)", () => {
      const matches = detectLabelAdjacent([makePage(1, "| DOB | 3 November 1978 |")]);
      expect(firstMatch(matches, "personal-name")?.text).toBe("3 November 1978");
    });

    it("matches 'd.o.b. - 22/09/1986' (dotted abbreviation + dash)", () => {
      const matches = detectLabelAdjacent([makePage(1, "d.o.b. - 22/09/1986")]);
      expect(firstMatch(matches, "personal-name")?.text).toBe("22/09/1986");
    });
  });

  describe("employee / personnel identifiers", () => {
    it("matches 'Employee number: ADC-2284'", () => {
      const matches = detectLabelAdjacent([makePage(1, "Employee number: ADC-2284")]);
      expect(firstMatch(matches, "confidential")?.text).toBe("ADC-2284");
    });

    it("matches 'Staff ID | EMP-2019-0847' (pipe separator)", () => {
      const matches = detectLabelAdjacent([makePage(1, "| Staff ID | EMP-2019-0847 |")]);
      expect(firstMatch(matches, "confidential")?.text).toBe("EMP-2019-0847");
    });

    it("matches 'personnel number: 4410-A' case-insensitively", () => {
      const matches = detectLabelAdjacent([makePage(1, "PERSONNEL NUMBER: 4410-A")]);
      expect(firstMatch(matches, "confidential")?.text).toBe("4410-A");
    });
  });

  describe("driver licence", () => {
    it("matches 'Driver licence: EA123456'", () => {
      const matches = detectLabelAdjacent([makePage(1, "Driver licence: EA123456")]);
      expect(firstMatch(matches, "nz-driver-licence")?.text).toBe("EA123456");
    });

    it("matches 'NZ Driver Licence | HM847219' in a pipe-separated row", () => {
      const matches = detectLabelAdjacent([
        makePage(1, "| NZ Driver Licence | HM847219 |"),
      ]);
      expect(firstMatch(matches, "nz-driver-licence")?.text).toBe("HM847219");
    });

    it("matches 'DL number: BA847219'", () => {
      const matches = detectLabelAdjacent([makePage(1, "DL number: BA847219")]);
      expect(firstMatch(matches, "nz-driver-licence")?.text).toBe("BA847219");
    });
  });

  describe("passport", () => {
    it("matches 'Passport: LA429183'", () => {
      const matches = detectLabelAdjacent([makePage(1, "Passport: LA429183")]);
      expect(firstMatch(matches, "nz-passport")?.text).toBe("LA429183");
    });

    it("matches 'NZ Passport | LA429183' in a row", () => {
      const matches = detectLabelAdjacent([makePage(1, "| NZ Passport | LA429183 |")]);
      expect(firstMatch(matches, "nz-passport")?.text).toBe("LA429183");
    });
  });

  describe("address", () => {
    it("matches 'Address: 8b Marlin Grove, Awatere 4318'", () => {
      const matches = detectLabelAdjacent([
        makePage(1, "Address: 8b Marlin Grove, Awatere 4318"),
      ]);
      expect(firstMatch(matches, "address")?.text).toBe("8b Marlin Grove, Awatere 4318");
    });

    it("matches 'Home address | 42 Whiteman Street'", () => {
      const matches = detectLabelAdjacent([
        makePage(1, "| Home address | 42 Whiteman Street |"),
      ]);
      expect(firstMatch(matches, "address")?.text).toBe("42 Whiteman Street");
    });

    it("does NOT match 'address' mid-sentence — 'We should address this issue'", () => {
      const matches = detectLabelAdjacent([
        makePage(1, "We should address this issue immediately."),
      ]);
      expect(firstMatch(matches, "address")).toBeUndefined();
    });
  });

  describe("salary / remuneration", () => {
    it("matches 'Salary band: Band 5 ($102,400 p.a.)'", () => {
      const matches = detectLabelAdjacent([
        makePage(1, "Salary band: Band 5 ($102,400 p.a.)"),
      ]);
      expect(firstMatch(matches, "confidential")?.text).toBe(
        "Band 5 ($102,400 p.a.)",
      );
    });

    it("matches 'Remuneration | Band 6 ($124,800 p.a.)' pipe-separated", () => {
      const matches = detectLabelAdjacent([
        makePage(1, "| Remuneration | Band 6 ($124,800 p.a.) |"),
      ]);
      expect(firstMatch(matches, "confidential")?.text).toBe(
        "Band 6 ($124,800 p.a.)",
      );
    });
  });

  describe("NHI", () => {
    it("matches 'NHI: JKA1234'", () => {
      const matches = detectLabelAdjacent([makePage(1, "NHI: JKA1234")]);
      expect(firstMatch(matches, "nhi")?.text).toBe("JKA1234");
    });

    it("matches 'Health number | MNE9087'", () => {
      const matches = detectLabelAdjacent([makePage(1, "| Health number | MNE9087 |")]);
      expect(firstMatch(matches, "nhi")?.text).toBe("MNE9087");
    });
  });

  describe("IRD", () => {
    it("matches 'IRD: 108-412-889'", () => {
      const matches = detectLabelAdjacent([makePage(1, "IRD: 108-412-889")]);
      expect(firstMatch(matches, "ird")?.text).toBe("108-412-889");
    });

    it("matches 'Tax number | 049-091-850'", () => {
      const matches = detectLabelAdjacent([makePage(1, "| Tax number | 049-091-850 |")]);
      expect(firstMatch(matches, "ird")?.text).toBe("049-091-850");
    });
  });

  describe("phone / email / bank", () => {
    it("matches 'Phone: 027 412 6789'", () => {
      const matches = detectLabelAdjacent([makePage(1, "Phone: 027 412 6789")]);
      expect(firstMatch(matches, "phone")?.text).toBe("027 412 6789");
    });

    it("matches 'Email: helen.ferguson@awateredc.govt.nz'", () => {
      const matches = detectLabelAdjacent([
        makePage(1, "Email: helen.ferguson@awateredc.govt.nz"),
      ]);
      expect(firstMatch(matches, "email-addr")?.text).toBe(
        "helen.ferguson@awateredc.govt.nz",
      );
    });

    it("matches 'E-mail | user@example.com' (hyphenated label, pipe)", () => {
      const matches = detectLabelAdjacent([
        makePage(1, "| E-mail | user@example.com |"),
      ]);
      expect(firstMatch(matches, "email-addr")?.text).toBe("user@example.com");
    });

    it("matches 'Bank account: 12-3456-7890123-00'", () => {
      const matches = detectLabelAdjacent([
        makePage(1, "Bank account: 12-3456-7890123-00"),
      ]);
      expect(firstMatch(matches, "bank-account")?.text).toBe("12-3456-7890123-00");
    });
  });

  describe("vehicle registration", () => {
    it("matches 'Number plate: ABC123'", () => {
      const matches = detectLabelAdjacent([makePage(1, "Number plate: ABC123")]);
      expect(firstMatch(matches, "vehicle-reg")?.text).toBe("ABC123");
    });

    it("matches 'Vehicle registration | KZT9472'", () => {
      const matches = detectLabelAdjacent([
        makePage(1, "| Vehicle registration | KZT9472 |"),
      ]);
      expect(firstMatch(matches, "vehicle-reg")?.text).toBe("KZT9472");
    });
  });

  // ---------------------------------------------------------------------
  // Context-sensitive entries — GP + ICD-10
  // ---------------------------------------------------------------------
  describe("GP / general practitioner (extra guard)", () => {
    it("matches 'GP: Dr Sarah Liang' — capitalised proper-noun value", () => {
      const matches = detectLabelAdjacent([makePage(1, "GP: Dr Sarah Liang")]);
      expect(firstMatch(matches, "personal-name")?.text).toBe("Dr Sarah Liang");
    });

    it("matches 'General practitioner | Dr Anya Gupta'", () => {
      const matches = detectLabelAdjacent([
        makePage(1, "| General practitioner | Dr Anya Gupta |"),
      ]);
      expect(firstMatch(matches, "personal-name")?.text).toBe("Dr Anya Gupta");
    });

    it("does NOT match 'at grid reference GP-12 on the site plan'", () => {
      const matches = detectLabelAdjacent([
        makePage(1, "at grid reference GP-12 on the site plan"),
      ]);
      expect(matches.filter((m) => m.type === "personal-name")).toHaveLength(0);
    });

    it("does NOT match 'GP: 12' — numeric value doesn't look like a name", () => {
      const matches = detectLabelAdjacent([makePage(1, "GP: 12")]);
      expect(matches.filter((m) => m.type === "personal-name")).toHaveLength(0);
    });
  });

  describe("ICD-10 diagnostic code (extra guard)", () => {
    it("matches 'ICD-10: F43.23' — valid code shape", () => {
      const matches = detectLabelAdjacent([makePage(1, "ICD-10: F43.23")]);
      expect(firstMatch(matches, "confidential")?.text).toBe("F43.23");
    });

    it("matches 'Diagnosis code | G31.9' pipe-separated", () => {
      const matches = detectLabelAdjacent([makePage(1, "| Diagnosis code | G31.9 |")]);
      expect(firstMatch(matches, "confidential")?.text).toBe("G31.9");
    });

    it("does NOT match 'ICD-10: mixed anxiety and depressed mood' (prose, not a code)", () => {
      const matches = detectLabelAdjacent([
        makePage(1, "ICD-10: mixed anxiety and depressed mood"),
      ]);
      expect(
        matches.filter(
          (m) => m.type === "confidential" && m.labelMatched.toLowerCase().includes("icd"),
        ),
      ).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------
  // FP guards
  // ---------------------------------------------------------------------
  describe("FP guards", () => {
    it("skips when value is empty ('Phone: ')", () => {
      const matches = detectLabelAdjacent([makePage(1, "Phone: ")]);
      expect(matches).toHaveLength(0);
    });

    it("skips when value is only whitespace (tabs/spaces)", () => {
      const matches = detectLabelAdjacent([makePage(1, "Phone:    \t  ")]);
      expect(matches).toHaveLength(0);
    });

    it("skips when value is 1 char (too short)", () => {
      const matches = detectLabelAdjacent([makePage(1, "Phone: a")]);
      expect(matches).toHaveLength(0);
    });

    it("skips when value starts with 'the' prose marker", () => {
      const matches = detectLabelAdjacent([
        makePage(1, "Address: the complainant lives elsewhere now"),
      ]);
      expect(matches).toHaveLength(0);
    });

    it("skips when label appears mid-sentence (not at line / cell start)", () => {
      const matches = detectLabelAdjacent([
        makePage(1, "Our reception desk has the phone: 04 800 8000 for enquiries"),
      ]);
      // "phone: 04 800 8000" is mid-prose, NOT at line start or after a pipe.
      expect(matches).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------
  // Multi-label / overlap / integration-style
  // ---------------------------------------------------------------------
  // ---------------------------------------------------------------------
  // Newline-as-separator (Azure DI extraction format)
  // ---------------------------------------------------------------------
  describe("newline-separated labels (Azure DI tabular extraction)", () => {
    it("matches B1-style stacked label+value pairs", () => {
      const pages = [
        makePage(
          1,
          "Date of birth\n14 June 1983\nEmployee number\nADC-2284\nIRD number\n108-412-889",
        ),
      ];
      const matches = detectLabelAdjacent(pages);
      const dob = matches.find((m) => m.type === "personal-name");
      const emp = matches.find((m) => m.type === "confidential");
      const ird = matches.find((m) => m.type === "ird");
      expect(dob?.text).toBe("14 June 1983");
      expect(emp?.text).toBe("ADC-2284");
      expect(ird?.text).toBe("108-412-889");
    });

    it("does NOT flag the next label as a value when two labels stack without an intervening value", () => {
      const pages = [
        makePage(1, "Date of birth\nEmployee number\nADC-2284"),
      ];
      const matches = detectLabelAdjacent(pages);
      // Employee number → ADC-2284 should match.
      expect(matches.find((m) => m.type === "confidential")?.text).toBe("ADC-2284");
      // Date of birth → "Employee number" must NOT fire.
      const dob = matches.find((m) => m.type === "personal-name");
      expect(dob).toBeUndefined();
    });

    it("handles multi-word labels split across extraction whitespace", () => {
      const pages = [
        makePage(1, "NZ driver licence\nEA123456"),
      ];
      expect(detectLabelAdjacent(pages).find((m) => m.type === "nz-driver-licence")?.text).toBe(
        "EA123456",
      );
    });
  });

  describe("multiple labels on one page (B1-style header table)", () => {
    const b1HeaderTable = [
      "Awatere District Council — HR Investigation Report",
      "| Name | Helen Margaret Ferguson |",
      "| Date of birth | 14 June 1983 |",
      "| Driver Licence | EA123456 |",
      "| Employee number | ADC-2284 |",
      "| Address | 42 Whiteman Street, Awatere 4310 |",
      "| Salary band | Band 5 ($102,400 p.a.) |",
    ].join("\n");

    it("captures the DOB", () => {
      const matches = detectLabelAdjacent([makePage(1, b1HeaderTable)]);
      expect(firstMatch(matches, "personal-name")?.text).toBe("14 June 1983");
    });

    it("captures the driver licence", () => {
      const matches = detectLabelAdjacent([makePage(1, b1HeaderTable)]);
      expect(firstMatch(matches, "nz-driver-licence")?.text).toBe("EA123456");
    });

    it("captures the employee number and salary band distinctly (both confidential)", () => {
      const matches = detectLabelAdjacent([makePage(1, b1HeaderTable)]);
      const confidentials = matches.filter((m) => m.type === "confidential");
      const texts = new Set(confidentials.map((m) => m.text));
      expect(texts.has("ADC-2284")).toBe(true);
      expect(texts.has("Band 5 ($102,400 p.a.)")).toBe(true);
    });

    it("captures the labelled address", () => {
      const matches = detectLabelAdjacent([makePage(1, b1HeaderTable)]);
      expect(firstMatch(matches, "address")?.text).toBe(
        "42 Whiteman Street, Awatere 4310",
      );
    });
  });

  // ---------------------------------------------------------------------
  // Metadata + enabledTypes
  // ---------------------------------------------------------------------
  describe("metadata and enabledTypes filtering", () => {
    it("assigns confidence 95 to matches (deterministic)", () => {
      const matches = detectLabelAdjacent([makePage(1, "Date of birth: 14 June 1983")]);
      expect(matches[0].confidence).toBe(95);
    });

    it("records which label variant triggered the match", () => {
      const matches = detectLabelAdjacent([makePage(1, "DOB: 14 June 1983")]);
      expect(matches[0].labelMatched.toLowerCase()).toBe("dob");
    });

    it("skips disabled types when enabledTypes is set", () => {
      const enabled = new Set(["address"]); // NHI always included by default
      const matches = detectLabelAdjacent(
        [makePage(1, "Driver licence: EA123456\nAddress: 42 Whiteman St")],
        enabled,
      );
      expect(matches.some((m) => m.type === "nz-driver-licence")).toBe(false);
      expect(matches.some((m) => m.type === "address")).toBe(true);
    });

    it("always includes nhi even when enabledTypes omits it (safety default)", () => {
      const enabled = new Set(["phone"]);
      const matches = detectLabelAdjacent(
        [makePage(1, "NHI: JKA1234\nPhone: 021 123 4567")],
        enabled,
      );
      expect(matches.some((m) => m.type === "nhi")).toBe(true);
    });

    it("always includes confidential even when enabledTypes omits it (catch-all type)", () => {
      const enabled = new Set(["phone"]);
      const matches = detectLabelAdjacent(
        [makePage(1, "Employee number: ADC-2284\nPhone: 021 123 4567")],
        enabled,
      );
      expect(matches.some((m) => m.type === "confidential" && m.text === "ADC-2284")).toBe(true);
    });
  });
});
