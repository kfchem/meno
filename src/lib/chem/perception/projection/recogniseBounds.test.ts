import { describe, expect, it } from "vitest";
import { chair } from "./solids";
import { drawn as drawnByRule } from "./views";
import { drawnAsChair, recogniseByViews, recogniseChair, LEVEL_ANGLE, MARGIN, NOT_MARKED, NOT_ONE_SHAPE } from "./recognise";

// The recognition's bounds that guard against reading a ring otherwise than drawn, each asked just inside and just outside (found in review).
// The numbers are set on the corpus of the tests; no text gives them (docs/EDITOR-2D.md, *Drawn in perspective*, the recognition's bounds).

const C = (x: number, y: number) => ({ x, y });
const DEG = Math.PI / 180;

/** The textbook chair (projection/views `drawn`, form 0), turned `degrees` in the page, scaled to bonds of 40. */
function turned(degrees: number) {
  const [c, s] = [Math.cos(degrees * DEG), Math.sin(degrees * DEG)];
  return drawnByRule(chair(), 0)!.atoms.map((p) => C(40 * (c * p.x - s * p.y), 40 * (s * p.x + c * p.y)));
}

describe("LEVEL_ANGLE: the lower atoms are the nearer only for a chair drawn near level", () => {
  // (the long axis of the ring as drawn - the principal axis of its places - and the page turn that lays it at `degrees` from level)
  const axis = (ring: readonly { x: number; y: number }[]) => {
    const [mx, my] = [0, 1].map((k) => ring.reduce((s, p) => s + (k ? p.y : p.x), 0) / ring.length);
    const [sxx, syy, sxy] = ring.reduce((s, p) => [s[0] + (p.x - mx) ** 2, s[1] + (p.y - my) ** 2, s[2] + (p.x - mx) * (p.y - my)], [0, 0, 0]);
    return (0.5 * Math.atan2(2 * sxy, sxx - syy)) / DEG;
  };
  const at = (degrees: number) => turned(degrees - axis(turned(0)));

  it("reads the textbook chair with its long axis a little under the bound from level, either way, by the convention, and leaves it unread a little over", () => {
    expect(LEVEL_ANGLE).toBeCloseTo(30 * DEG, 12);
    for (const a of [-28, 0, 28]) {
      expect(axis(at(a))).toBeCloseTo(a, 6);
      expect(recogniseChair(at(a)), `${a}`).toMatchObject({ kind: "depth", by: "convention" });
    }
    for (const a of [-32, 32]) expect(recogniseChair(at(a)), `${a}`).toEqual({ kind: "unread", why: NOT_MARKED });
  });

  it("reads it past the bound by a mark all the same: the bound is the convention's alone", () => {
    expect(recogniseChair(at(32), [0])).toMatchObject({ kind: "depth", by: "mark" });
  });
});

describe("MARGIN: a drawing two readings fit nearly as well is unread", () => {
  // (five places, no symmetry; two views of them that read the depth two ways, each off the places by one atom moved: by `a` and by `b`.
  //  The miss of a fit is a square in the displacement, so the second fits (b / a)^2 times worse than the first)
  const places = [C(0, 0), C(1, 0.1), C(1.7, 0.8), C(1.1, 1.6), C(0.2, 1.1)];
  const zA = [1, 0.8, -0.5, -1, -0.3];
  // (another shape: not the first view's depths, nor their mirror)
  const zB = [1, -1, 0.5, 0.3, -0.8];
  const moved = (by: number) => places.map((p, k) => (k === 2 ? C(p.x + by * 0.6, p.y + by * 0.8) : p));
  const view = (by: number, z: readonly number[]) => moved(by).map((p, k) => ({ ...p, z: z[k] }));
  const read = (ratio: number) => recogniseByViews(places, [view(0.05, zA), view(0.05 * Math.sqrt(ratio), zB)], [[0, 1]]);

  it("reads the better view where the other fits more than three times worse, and neither where less", () => {
    expect(MARGIN).toBe(3);
    expect(read(3.3)).toMatchObject({ kind: "depth", by: "mark" });
    expect(read(10)).toMatchObject({ kind: "depth", by: "mark" });
    expect(read(2.7)).toEqual({ kind: "unread", why: NOT_ONE_SHAPE });
    expect(read(1.2)).toEqual({ kind: "unread", why: NOT_ONE_SHAPE });
  });

  it("reads the depth of the view that fits better, its sign by the mark", () => {
    const got = read(4);
    expect(got.kind).toBe("depth");
    if (got.kind !== "depth") return;
    // (the first view's shape, nearer where the bold bond 0-1 is)
    expect(got.z[0] + got.z[1]).toBeGreaterThan(0);
    expect(Math.sign(got.z[3])).toBe(-1);
  });
});

describe("PARALLEL: a ring drawn as a chair has its opposite bonds near parallel", () => {
  // (a cyclohexane chair as a textbook draws it; then its third atom turned about its second, one pair of opposite bonds that far off)
  const CHAIR = [C(0, 0), C(1.4, -0.5), C(2.8, 0.4), C(4, 0.1), C(2.6, 0.6), C(1.2, -0.3)];
  const turnedAt = (degrees: number) => {
    const t = degrees * DEG;
    const [dx, dy] = [CHAIR[2].x - CHAIR[1].x, CHAIR[2].y - CHAIR[1].y];
    return CHAIR.map((p, k) => (k === 2 ? C(CHAIR[1].x + dx * Math.cos(t) - dy * Math.sin(t), CHAIR[1].y + dx * Math.sin(t) + dy * Math.cos(t)) : p));
  };

  it("is a chair at ten degrees off, not at fourteen: the bound is twelve", () => {
    expect(drawnAsChair(CHAIR)).toBe(true);
    expect(drawnAsChair(turnedAt(10))).toBe(true);
    expect(drawnAsChair(turnedAt(14))).toBe(false);
    expect(drawnAsChair(turnedAt(25))).toBe(false);
  });
});
