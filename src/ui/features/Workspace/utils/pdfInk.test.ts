import { describe, expect, it } from "vitest";
import { inkOnPage, pageUnder, pointsOnPage, toPagePoint } from "./pdfInk";
import { POINT } from "../../../../lib/pdf/layout";
import type { PdfItem } from "../store/types";

const pdf = (more: Partial<PdfItem> = {}): PdfItem => ({ id: 1, name: "a.pdf", sha256: "a".repeat(64), pages: [[612, 792], [612, 792]], x: 0, y: 0, page: 0, ...more });

describe("writing on a PDF's page", () => {
  it("is on the page under the press - the PDF on top - none off them or on an icon", () => {
    expect(pageUnder([pdf()], { x: 0, y: 0 })).toMatchObject({ pdf: 1, page: 0 });
    expect(pageUnder([pdf(), pdf({ id: 2, page: 1 })], { x: 0, y: 0 })).toMatchObject({ pdf: 2, page: 1 });
    expect(pageUnder([pdf()], { x: 1000, y: 0 })).toBeNull();
    expect(pageUnder([pdf({ icon: true })], { x: 0, y: 0 })).toBeNull();
  });

  it("is kept in the page's points, from its top left", () => {
    const hit = pageUnder([pdf()], { x: 0, y: 0 })!;
    // (its middle: half its width across, half its height down)
    const mid = toPagePoint(hit.sheet, hit.pt, { x: 0, y: 0 });
    expect(mid.x).toBeCloseTo(306);
    expect(mid.y).toBeCloseTo(396);
    const corner = toPagePoint(hit.sheet, hit.pt, { x: -306 * POINT, y: 396 * POINT });
    expect(corner.x).toBeCloseTo(0);
    expect(corner.y).toBeCloseTo(0);
    expect(pointsOnPage(hit.sheet, hit.pt, [0, 0, 0.7]).map((v) => Math.round(v))).toEqual([306, 396, 1]);
  });

  it("is listed by page, the same list while it is unchanged", () => {
    const p = pdf({ inks: [{ page: 1, pen: "pen", width: 1, strokes: [{ points: [1, 2, 0.5] }] }] });
    expect(inkOnPage(p, 1)).toBe(inkOnPage(p, 1));
    expect(inkOnPage(p, 0)).toBeUndefined();
  });
});
