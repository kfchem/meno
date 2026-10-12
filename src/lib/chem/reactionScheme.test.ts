import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH } from "./acs";
import { arrowEnds, arrowPoints, plusMeasures, plusOutline, reactionRoles, reshapedArrow, schemeOutlines, schemePieces, wordsLine } from "./reactionScheme";
import { ACS_1996, bondFraction } from "./style";

const L = NOMINAL_BOND_LENGTH;
const atom = (id: number, x: number, y: number, extra: object = {}) => ({ id, x, y, ...extra });

describe("a plus", () => {
  it("is about as wide as the sign set in the labels' typeface, its bars a bond's line", () => {
    const m = plusMeasures(ACS_1996, L);
    expect(m.size).toBeCloseTo(0.6 * bondFraction(ACS_1996.fontSize, ACS_1996) * L, 9);
    expect(m.thickness).toBeCloseTo(bondFraction(ACS_1996.lineThickness, ACS_1996) * L, 9);
  });

  it("is a cross of twelve corners about its middle", () => {
    const outline = plusOutline({ x: 5, y: 1 }, { size: 2, thickness: 0.2 });
    expect(outline).toHaveLength(12);
    const xs = outline.map((p) => p.x);
    const ys = outline.map((p) => p.y);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([4, 6, 0, 2]);
    // anticlockwise: a positive area
    let area = 0;
    outline.forEach((p, i) => {
      const q = outline[(i + 1) % outline.length];
      area += p.x * q.y - q.x * p.y;
    });
    // two bars, less the square they share
    expect(area / 2).toBeCloseTo(2 * (2 * 0.2) - 0.2 * 0.2, 9);
  });

  it("goes into a picture with the arrows, each in its own outline", () => {
    const outlines = schemeOutlines(
      { arrows: [{ x: 0, y: 0, angle: 0, length: 3 }], pluses: [{ x: -3, y: 0 }, { x: 3, y: 0 }] },
      ACS_1996,
      L,
    );
    expect(outlines).toHaveLength(3);
    expect(outlines.slice(1).map((o) => o.length)).toEqual([12, 12]);
    // the arrow's point, at the end it points to
    expect(Math.max(...outlines[0].map((p) => p.x))).toBeCloseTo(1.5, 9);
  });
});

describe("a drawn reaction's roles", () => {
  // the arrow from x = 0 to 3, pointing right
  const arrow = { x: 1.5, y: 0, angle: 0, length: 3 };

  it("are by where each structure is against the arrow: before, past or beside it", () => {
    const model = {
      atoms: [atom(1, -3, 0), atom(2, -2, 0), atom(3, 5, 0), atom(4, 1.5, 1.2), atom(5, 1.5, -1.2)],
      bonds: [{ a: 1, b: 2 }],
    };
    expect(reactionRoles(model, arrow, [], L)).toEqual({
      reactants: [[1, 2]],
      products: [[3]],
      // the one above an arrow pointing right first
      reagents: [[4], [5]],
    });
    expect(arrowEnds(arrow)).toEqual({ from: { x: 0, y: 0 }, to: { x: 3, y: 0 } });
  });

  it("follow the arrow whichever way it points", () => {
    // pointing down: what is above it reacts, what is below is made
    const down = { x: 0, y: 0, angle: -Math.PI / 2, length: 3 };
    const model = { atoms: [atom(1, 0, 4), atom(2, 0, -4), atom(3, 1, 0)], bonds: [] };
    expect(reactionRoles(model, down, [], L)).toEqual({ reactants: [[1]], products: [[2]], reagents: [[3]] });
  });

  it("make two molecules of structures a plus stands between, or a bond and more apart", () => {
    // two close together with a plus between, two far apart without one
    const model = {
      atoms: [atom(1, -6, 0), atom(2, -5.5, 0), atom(3, 4, 0), atom(4, 8, 0)],
      bonds: [],
    };
    const roles = reactionRoles(model, arrow, [{ x: -5.75, y: 0 }], L);
    expect(roles.reactants).toEqual([[1], [2]]);
    expect(roles.products).toEqual([[3], [4]]);
  });

  it("make one molecule of ions drawn close together, with no plus between them", () => {
    const model = {
      atoms: [atom(1, -3, 0, { el: "Na" }), atom(2, -2.2, 0, { el: "Cl" }), atom(3, 5, 0)],
      bonds: [],
    };
    expect(reactionRoles(model, arrow, [], L).reactants).toEqual([[1, 2]]);
  });

  it("keep together a haptic bond's atoms and an Sgroup's", () => {
    // a metal bonded to a star at a ring's middle, the ring's atoms its
    // endpoints but bonded to nothing else here; and two atoms of one group
    const model = {
      atoms: [
        atom(1, -4, 0, { el: "Fe" }),
        atom(2, -4, 1, { el: "*" }),
        atom(3, -4.5, 6),
        atom(4, -3.5, 6),
        atom(5, 8, 0, { sgroups: [{ id: 9 }] }),
        atom(6, 12, 0, { sgroups: [{ id: 9 }] }),
      ],
      bonds: [{ a: 1, b: 2, endpoints: [3, 4] }],
    };
    const roles = reactionRoles(model, arrow, [], L);
    expect(roles.reactants).toEqual([[1, 2, 3, 4]]);
    expect(roles.products).toEqual([[5, 6]]);
  });
});

describe("an arrow drawn out by one end", () => {
  const step = Math.PI / 12;

  it("takes its point to the pointer, its tail staying, the direction in steps", () => {
    // 6 degrees off level: level
    const a = reshapedArrow("head", { x: 0, y: 0 }, { x: 4 * Math.cos(0.1), y: 4 * Math.sin(0.1) }, { step, minLength: 0.5 });
    expect(arrowEnds(a).from).toEqual({ x: 0, y: 0 });
    expect(a.angle).toBeCloseTo(0, 9);
    expect(a.length).toBeCloseTo(4, 9);
    // and freely, with no steps
    const free = reshapedArrow("head", { x: 0, y: 0 }, { x: 4 * Math.cos(0.1), y: 4 * Math.sin(0.1) }, { minLength: 0.5 });
    expect(free.angle).toBeCloseTo(0.1, 9);
  });

  it("takes its tail to the pointer, its point staying where it was", () => {
    // the tail dragged up and to the left of the point at (3, 0): pointing down and right
    const a = reshapedArrow("tail", { x: 3, y: 0 }, { x: 0, y: 3 }, { step, minLength: 0.5 });
    const { from, to } = arrowEnds(a);
    expect(to.x).toBeCloseTo(3, 9);
    expect(to.y).toBeCloseTo(0, 9);
    expect(from.x).toBeCloseTo(0, 9);
    expect(from.y).toBeCloseTo(3, 9);
    expect(a.angle).toBeCloseTo(-Math.PI / 4, 9);
  });

  it("is never shorter than it is allowed to be", () => {
    const a = reshapedArrow("head", { x: 0, y: 0 }, { x: 0.1, y: 0 }, { step, minLength: 0.5 });
    expect(a.length).toBe(0.5);
    expect(arrowEnds(a).to.x).toBeCloseTo(0.5, 9);
  });
});

describe("an arrow that turns", () => {
  const bent = { x: 5, y: 0, angle: 0, length: 10, corners: [{ along: 0.2, across: 3 }] };

  it("runs through its corners, from its tail to its point", () => {
    const pts = arrowPoints(bent);
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[1].x).toBeCloseTo(2, 9);
    expect(pts[1].y).toBeCloseTo(3, 9);
    expect(pts[2]).toEqual({ x: 10, y: 0 });
  });

  it("has its words over its longest stretch", () => {
    const line = wordsLine(bent);
    expect(line.length).toBeCloseTo(Math.hypot(8, 3), 9);
    expect(line.x).toBeCloseTo(6, 9);
    expect(line.y).toBeCloseTo(1.5, 9);
    expect(line.angle).toBeCloseTo(Math.atan2(-3, 8), 9);
    // (one straight: itself)
    const straight = { x: 1, y: 2, angle: 0.3, length: 4 };
    expect(wordsLine(straight)).toBe(straight);
  });
});

describe("a scheme's arrows in a picture", () => {
  it("go each in their pieces, in their own colour where they have one", () => {
    const pieces = schemePieces({ arrows: [{ x: 0, y: 0, angle: 0, length: 3, color: "#c44848", kind: "equilibrium" }, { x: 0, y: 5, angle: 0, length: 3 }] }, ACS_1996, L);
    expect(pieces.filter((p) => p.color === "#c44848")).toHaveLength(4);
    expect(pieces.filter((p) => !p.color)).toHaveLength(1);
  });
});
