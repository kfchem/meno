import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import { emptyWorkspaceDocument, type WorkspaceDocument } from "./document";
import { pdfBounds, POINT, topSheet } from "../../../lib/pdf/layout";
import { pdfsInRow } from "./document";
import { bondPtOf, pointOfStyle, restyled, restyledDocument } from "./restyle";

const ACS = { preset: "acs1996", changes: {} };
const RSC = { preset: "rsc", changes: {} };

/** A page with one of everything a change of style converts. */
function page(): WorkspaceDocument {
  const L = NOMINAL_BOND_LENGTH;
  return {
    ...emptyWorkspaceDocument(),
    style: ACS,
    model: {
      atoms: [
        // (ethane at 10, 0; a lone atom at -20, 5; a stack of two records at 40, 40)
        { id: 1, el: "C", x: 10 - L / 2, y: 0 },
        { id: 2, el: "C", x: 10 + L / 2, y: 0 },
        { id: 3, el: "O", x: -20, y: 5 },
        { id: 4, el: "C", x: 39, y: 40, stack: { id: 1, record: 1 } },
        { id: 5, el: "N", x: 41, y: 40, stack: { id: 1, record: 1 } },
        { id: 6, el: "C", x: 38, y: 41, stack: { id: 1, record: 2 } },
        { id: 7, el: "S", x: 42, y: 41, stack: { id: 1, record: 2 } },
      ],
      bonds: [
        { id: 1, a: 1, b: 2, order: 1 },
        { id: 2, a: 4, b: 5, order: 1 },
        { id: 3, a: 6, b: 7, order: 1 },
      ],
    } as WorkspaceDocument["model"],
    arrows: [{ id: 1, x: 30, y: 10, angle: 0.3, length: 12, corners: [{ along: 0.5, across: 2 }] }],
    pluses: [{ id: 1, x: 20, y: -3 }],
    captions: [{ id: 1, x: 5, y: 8, text: "heat", width: 24, size: 12 }],
    texts: [{ id: 1, name: "run.log", text: "", at: { x: -40, y: -40 } }],
    pdfs: [{ id: 1, name: "a.pdf", sha256: "a".repeat(64), pages: [[612, 792]], x: 60, y: 0, page: 0, placed: [{ page: 0, x: 70, y: 5 }], point: POINT }],
    pictures: [{ id: 1, name: "p.png", sha256: "b".repeat(64), media: "image/png", px: [64, 48], x: -10, y: 30, w: 16, h: 12, turn: 0.2 }],
    slides: [{ id: 1, x: 0, y: 0, w: 160, h: 90 }],
    shapes: [{ id: 1, kind: "callout", x0: -5, y0: -5, x1: 5, y1: 5, tail: { x: 8, y: 9 }, weight: "thick" }],
    inks: [{ id: 1, pen: "pen", width: 1, strokes: [{ points: [1, 2, 0.4, 3, 4, 0.6] }] }],
    steps: [{ id: 1, kind: "xtb-opt", x: 100, y: 0 } as unknown as NonNullable<WorkspaceDocument["steps"]>[number]],
    // (a set round the ethane, with room about it)
    sets: [{ id: 2, x0: 5, y0: -4, x1: 15, y1: 4 }],
  } as WorkspaceDocument;
}

/** Every number in `a` within 1e-9 of `b`'s, the rest equal. */
function near(a: unknown, b: unknown): void {
  if (typeof a === "number" && typeof b === "number") {
    expect(Math.abs(a - b)).toBeLessThan(1e-9);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    for (const key of Object.keys(a)) near((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]);
    return;
  }
  expect(a).toEqual(b);
}

describe("a change of drawing style", () => {
  const k = bondPtOf(ACS) / bondPtOf(RSC);

  it("keeps every page object's printed size and place, and structures' size in units, their middles moved", () => {
    const was = page();
    const now = restyled(was, k);
    // (a point is 1.8 / bond pt units: what was w units at ACS prints w * 14.4 / 1.8 pt)
    const pt = (units: number, style: typeof ACS) => (units * bondPtOf(style)) / NOMINAL_BOND_LENGTH;
    expect(pt(now.slides![0].w, RSC)).toBeCloseTo(pt(was.slides![0].w, ACS), 9);
    expect(pt(now.pictures![0].h, RSC)).toBeCloseTo(pt(was.pictures![0].h, ACS), 9);
    expect(pt(now.pictures![0].x, RSC)).toBeCloseTo(pt(was.pictures![0].x, ACS), 9);
    expect(now.pictures![0].turn).toBe(0.2);
    expect(now.captions![0]).toMatchObject({ x: 5 * k, y: 8 * k, width: 24 * k, size: 12 });
    expect(now.arrows![0]).toMatchObject({ x: 30 * k, length: 12 * k, angle: 0.3, corners: [{ along: 0.5, across: 2 * k }] });
    expect(now.shapes![0]).toMatchObject({ x1: 5 * k, tail: { x: 8 * k, y: 9 * k }, weight: "thick" });
    expect(now.inks![0].strokes[0].points).toEqual([1 * k, 2 * k, 0.4, 3 * k, 4 * k, 0.6]);
    expect(now.pdfs![0]).toMatchObject({ x: 60 * k, placed: [{ page: 0, x: 70 * k, y: 5 * k }], pages: [[612, 792]] });
    // (a PDF's page prints at its own size before and after: 612 pt wide)
    expect(pt(topSheet(was.pdfs![0]).w, ACS)).toBeCloseTo(612, 9);
    expect(pt(topSheet(now.pdfs![0]).w, RSC)).toBeCloseTo(612, 9);
    expect(now.texts![0].at).toEqual({ x: -40 * k, y: -40 * k });
    expect(now.steps![0]).toMatchObject({ x: 100 * k, y: 0 });
    // the ethane: its middle times k, its bond as long in units as before
    const [a, b] = now.model.atoms;
    expect((a.x + b.x) / 2).toBeCloseTo(10 * k, 9);
    expect(b.x - a.x).toBeCloseTo(NOMINAL_BOND_LENGTH, 12);
    // a lone atom moves as a structure of its own; a stack's records move as one
    expect(now.model.atoms[2]).toMatchObject({ x: -20 * k, y: 5 * k });
    const off = (i: number) => now.model.atoms[i].x - was.model.atoms[i].x;
    expect(off(3)).toBeCloseTo((40 * k - 40), 9);
    for (const i of [4, 5, 6]) expect(off(i)).toBeCloseTo(off(3), 12);
  });

  it("fits a workflow's set round what it holds, with the same room about it", () => {
    const now = restyled(page(), k);
    const [a, b] = now.model.atoms;
    const set = now.sets![0];
    // (before: atoms 9.1 to 10.9 across, the set 5 to 15 - 4.1 of room each side)
    expect(set.x0).toBeCloseTo(a.x - 4.1, 9);
    expect(set.x1).toBeCloseTo(b.x + 4.1, 9);
    expect(set.y0).toBeCloseTo(-4, 9);
  });

  it("goes back as it was, changed back", () => {
    const was = page();
    near(restyled(restyled(was, k), 1 / k), was);
  });

  it("leaves the page as it is where the bond prints as long", () => {
    const was = page();
    expect(restyled(was, 1)).toBe(was);
    expect(restyledDocument(was, { preset: "acs1996", changes: { lineWidthPt: 1 } as never }).model).toBe(was.model);
  });

  it("is one document: the style set, the page converted by the old bond over the new", () => {
    const was = page();
    const now = restyledDocument(was, RSC);
    expect(now.style).toEqual(RSC);
    expect(now.slides![0].w).toBeCloseTo(160 * k, 9);
    // (a document with no style yet is given one, its page as it was)
    // (none can be had now - the style is always set - but a document read some other way is kept whole)
    const bare = { ...was, style: undefined } as unknown as typeof was;
    expect(restyledDocument(bare, RSC).slides).toBe(was.slides);
  });

  it("lays a PDF put on the page at the workspace's point, and one kept from before at ACS 1996's", () => {
    const [p] = pdfsInRow([{ name: "a.pdf", sha256: "c".repeat(64), pages: [[612, 792]] }], { x: 0, y: 0 }, pointOfStyle(RSC));
    expect(p.point).toBeCloseTo(NOMINAL_BOND_LENGTH / bondPtOf(RSC), 12);
    expect(topSheet(p).w).toBeCloseTo((612 * NOMINAL_BOND_LENGTH) / bondPtOf(RSC), 9);
    const [q] = pdfsInRow([{ name: "a.pdf", sha256: "c".repeat(64), pages: [[612, 792]] }], { x: 0, y: 0 });
    expect(q.point).toBeUndefined();
    expect(topSheet(q).w).toBeCloseTo(612 * POINT, 12);
    // (an icon at any point is the same share of its pages: its room scales with them)
    const icon = pdfBounds({ ...p, x: 0, y: 0 });
    const iconAcs = pdfBounds({ ...q, x: 0, y: 0 });
    expect(icon.x1 - icon.x0).toBeCloseTo(((iconAcs.x1 - iconAcs.x0) * bondPtOf(ACS)) / bondPtOf(RSC), 9);
  });

  it("converts about a point: a copy's parts about their middle", () => {
    const about = { x: 100, y: 50 };
    const now = restyled({ pluses: [{ id: 1, x: 110, y: 50 }] }, 2, about);
    expect(now.pluses![0]).toMatchObject({ x: 120, y: 50 });
  });
});
