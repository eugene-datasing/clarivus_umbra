import { describe, it, expect } from "vitest";
import {
  isStructurallySane,
  refreshSegments,
} from "../rebuild-content";
import type { DetectionInput } from "../content-builder";
import type { DocParagraph } from "@/lib/db/mappers";

function makeDetection(
  id: string,
  text: string,
  page: number = 1,
  overrides: Partial<DetectionInput> = {},
): DetectionInput {
  return {
    id,
    type: "Name",
    text,
    page,
    confidence: 95,
    ...overrides,
  };
}

describe("isStructurallySane", () => {
  it("returns false for null, undefined, and non-arrays", () => {
    expect(isStructurallySane(null)).toBe(false);
    expect(isStructurallySane(undefined)).toBe(false);
    expect(isStructurallySane({})).toBe(false);
    expect(isStructurallySane("string")).toBe(false);
    expect(isStructurallySane(42)).toBe(false);
  });

  it("returns false for an empty array", () => {
    expect(isStructurallySane([])).toBe(false);
  });

  it("returns false when no entry has a recognised type", () => {
    expect(isStructurallySane([{ segments: [{ text: "x" }] }])).toBe(false);
    expect(
      isStructurallySane([{ type: "not-a-real-type", segments: [] }]),
    ).toBe(false);
  });

  it("returns true when at least one entry has a recognised type", () => {
    const input: DocParagraph[] = [
      { segments: [{ text: "untyped legacy entry" }] },
      { type: "paragraph", segments: [{ text: "a real paragraph" }] },
    ];
    expect(isStructurallySane(input)).toBe(true);
  });

  it("returns true for every recognised block type", () => {
    for (const type of ["heading", "paragraph", "list", "image", "table"] as const) {
      expect(isStructurallySane([{ type, segments: [] }])).toBe(true);
    }
  });
});

describe("refreshSegments — table case", () => {
  it("refreshes cell segments without losing rows, cells, or type=table", () => {
    const input: DocParagraph[] = [
      {
        type: "table",
        page: 1,
        segments: [],
        rows: [
          {
            cells: [
              { segments: [{ text: "Date of birth" }], isHeader: true },
              { segments: [{ text: "14 June 1983" }], isHeader: true },
            ],
          },
          {
            cells: [
              { segments: [{ text: "Phone" }] },
              { segments: [{ text: "021 456 7890" }] },
            ],
          },
        ],
      },
    ];
    const detections = [
      makeDetection("d1", "14 June 1983"),
      makeDetection("d2", "021 456 7890"),
    ];

    const result = refreshSegments(input, detections);

    // type preserved
    expect(result[0].type).toBe("table");

    // rows preserved — no rows dropped, no cells dropped
    expect(result[0].rows?.length).toBe(2);
    expect(result[0].rows?.[0].cells.length).toBe(2);
    expect(result[0].rows?.[1].cells.length).toBe(2);

    // header flag preserved
    expect(result[0].rows?.[0].cells[0].isHeader).toBe(true);
    expect(result[0].rows?.[0].cells[1].isHeader).toBe(true);
    expect(result[0].rows?.[1].cells[0].isHeader).toBeUndefined();

    // cell segments reflect the post-mutation detection set
    const dobCell = result[0].rows?.[0].cells[1];
    expect(dobCell?.segments.some((s) => s.detectionId === "d1")).toBe(true);
    const phoneCell = result[0].rows?.[1].cells[1];
    expect(phoneCell?.segments.some((s) => s.detectionId === "d2")).toBe(true);

    // label cells (no matching detections) unaffected
    const labelCell = result[0].rows?.[0].cells[0];
    expect(labelCell?.segments.every((s) => !s.detectionId)).toBe(true);
  });

  it("drops a stale cell detection when the detection is no longer in the input set", () => {
    // Pre-mutation: cell had two detections highlighted.
    const input: DocParagraph[] = [
      {
        type: "table",
        page: 1,
        segments: [],
        rows: [
          {
            cells: [
              {
                segments: [
                  { text: "Contact " },
                  { text: "Mrs Smith", detectionId: "dX" },
                  { text: " on " },
                  { text: "021 111 2222", detectionId: "dY" },
                ],
              },
            ],
          },
        ],
      },
    ];
    // Post-mutation: dY deleted, dX retained.
    const detections = [makeDetection("dX", "Mrs Smith")];

    const result = refreshSegments(input, detections);

    const cellSegs = result[0].rows?.[0].cells[0].segments;
    expect(cellSegs?.some((s) => s.detectionId === "dX")).toBe(true);
    expect(cellSegs?.every((s) => s.detectionId !== "dY")).toBe(true);
    // Full text round-tripped
    const joined = cellSegs?.map((s) => s.text).join("");
    expect(joined).toBe("Contact Mrs Smith on 021 111 2222");
  });
});

describe("refreshSegments — other block types", () => {
  it("refreshes list item segments without losing list structure", () => {
    const input: DocParagraph[] = [
      {
        type: "list",
        listStyle: "bullet",
        page: 1,
        segments: [],
        items: [
          {
            type: "paragraph",
            page: 1,
            segments: [{ text: "Item one mentions John Smith." }],
          },
          {
            type: "paragraph",
            page: 1,
            segments: [{ text: "Item two mentions no-one." }],
          },
        ],
      },
    ];
    const detections = [makeDetection("d1", "John Smith")];
    const result = refreshSegments(input, detections);

    expect(result[0].type).toBe("list");
    expect(result[0].listStyle).toBe("bullet");
    expect(result[0].items?.length).toBe(2);
    expect(
      result[0].items?.[0].segments.some((s) => s.detectionId === "d1"),
    ).toBe(true);
    expect(
      result[0].items?.[1].segments.every((s) => !s.detectionId),
    ).toBe(true);
  });

  it("refreshes heading segments and preserves level", () => {
    const input: DocParagraph[] = [
      {
        type: "heading",
        level: 2,
        page: 1,
        segments: [{ text: "Investigation findings about John Smith" }],
      },
    ];
    const detections = [makeDetection("d1", "John Smith")];
    const result = refreshSegments(input, detections);

    expect(result[0].type).toBe("heading");
    expect(result[0].level).toBe(2);
    expect(
      result[0].segments.some((s) => s.detectionId === "d1"),
    ).toBe(true);
  });

  it("refreshes paragraph segments", () => {
    const input: DocParagraph[] = [
      {
        type: "paragraph",
        page: 1,
        segments: [{ text: "Please contact John Smith by Friday." }],
      },
    ];
    const detections = [makeDetection("d1", "John Smith")];
    const result = refreshSegments(input, detections);

    expect(result[0].type).toBe("paragraph");
    expect(
      result[0].segments.some((s) => s.detectionId === "d1"),
    ).toBe(true);
  });

  it("treats legacy untyped paragraphs as paragraphs", () => {
    const input: DocParagraph[] = [
      { page: 1, segments: [{ text: "Legacy paragraph naming John Smith." }] },
    ];
    const detections = [makeDetection("d1", "John Smith")];
    const result = refreshSegments(input, detections);

    expect(
      result[0].segments.some((s) => s.detectionId === "d1"),
    ).toBe(true);
    expect(result[0].page).toBe(1);
  });

  it("preserves image placeholders unchanged", () => {
    const input: DocParagraph[] = [
      {
        type: "image",
        page: 1,
        segments: [{ text: "[Embedded image]" }],
      },
    ];
    const detections = [makeDetection("d1", "John")];
    const result = refreshSegments(input, detections);

    expect(result[0].type).toBe("image");
    expect(result[0].segments).toEqual([{ text: "[Embedded image]" }]);
  });
});
