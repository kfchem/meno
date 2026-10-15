import { describe, expect, it } from "vitest";
import {
  unspecifiedDoubles,
  bondKind,
  buildAllPrimitives,
  BOND_SEEN_LEAST,
  buildBondPrimitives,
  joinsAtAtoms,
  buildTextLabels,
  implicitHydrogens,
  isTail,
  labelHulls,
  labelSetOf,
  layoutMolecule,
  markExtent,
  mitreJoinPolys,
  placeLabel,
  roundPolyCorners,
  type Atom,
  type Bond,
  type LayoutOptions,
  type LineSeg,
  type Vec2,
  wedgeNarrowAtom,
  cumulatedShown,
  runsPlaces,
  runsWidth,
  type TextRun,
} from "./layout2d";
import { acsWorldOptions, NOMINAL_BOND_LENGTH } from "./acs";
import { advanceEm, inkHullEm } from "./arial";

const opts = (over: Partial<LayoutOptions> = {}): LayoutOptions =>
  acsWorldOptions([], [], { units: "world", ...over });

/**
 * The hashes of a hashed wedge lying along +x, from their trapezoids: where
 * each sits along the bond, and how far across it reaches at either edge.
 */
const hashesOf = (polys: { points: Vec2[] }[]) =>
  polys
    .filter((p) => p.points.length === 4)
    .map((p) => {
      const xs = p.points.map((q) => q.x);
      const near = Math.min(...xs);
      const far = Math.max(...xs);
      const across = (x: number) => {
        const ys = p.points
          .filter((q) => Math.abs(q.x - x) < 1e-9)
          .map((q) => q.y);
        return Math.max(...ys) - Math.min(...ys);
      };
      return {
        near,
        far,
        at: (near + far) / 2,
        nearWidth: across(near),
        farWidth: across(far),
      };
    })
    .sort((a, b) => a.at - b.at);

/** Whether `p` lies inside the polygon `pts` (crossing count). */
const inside = (p: Vec2, pts: Vec2[]) => {
  let crossings = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)) crossings++;
  }
  return crossings % 2 === 1;
};

const polyArea = (pts: Vec2[]) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
};

describe("implicitHydrogens", () => {
  it("fills the usual valences", () => {
    expect(implicitHydrogens("O", 1)).toBe(1); // hydroxyl
    expect(implicitHydrogens("O", 2)).toBe(0); // ether
    expect(implicitHydrogens("N", 1)).toBe(2); // primary amine
    expect(implicitHydrogens("N", 3)).toBe(0);
    expect(implicitHydrogens("C", 3)).toBe(1);
    expect(implicitHydrogens("S", 1)).toBe(1);
    expect(implicitHydrogens("Cl", 1)).toBe(0);
  });

  it("never goes negative, and leaves unknown elements alone", () => {
    // sulfone: more bonds than the default valence
    expect(implicitHydrogens("S", 6)).toBe(0);
    expect(implicitHydrogens("Fe", 2)).toBe(0);
    expect(implicitHydrogens("R", 1)).toBe(0);
  });
});

describe("buildTextLabels", () => {
  it("writes the hydrogens below when bonds rise on both sides, above when they fall", () => {
    const L = NOMINAL_BOND_LENGTH;
    const v = (deg: number) => ({ x: L * Math.cos((deg * Math.PI) / 180), y: L * Math.sin((deg * Math.PI) / 180) });
    const at = (a: number, b: number) => {
      const atoms: Atom[] = [
        { id: 1, x: 0, y: 0, el: "N" },
        { id: 2, ...v(a), el: "C" },
        { id: 3, ...v(b), el: "C" },
      ];
      const [nh] = buildTextLabels(atoms, opts(), [
        { a1: 0, a2: 1, order: 1 },
        { a1: 0, a2: 2, order: 1 },
      ]);
      return nh;
    };
    expect(at(150, 30).stack).toBe("below");
    expect(at(210, 330).stack).toBe("above");
    // one side free: the hydrogens go there, on the same line
    expect(at(150, 270).stack).toBeUndefined();
    expect(at(150, 270).text).toBe("NH");
    // two bonds nearly in a line, steep, on both sides: the line above and
    // below on a bond, the row beside the symbol open - written there
    // (tetrodotoxin's guanidine NH, its H on the bond from above)
    for (const [a, b] of [
      [115, 295],
      [65, 245],
    ]) {
      const nh = at(a, b);
      expect(nh.stack).toBeUndefined();
      // (its H on the row, the two sides alike: after the symbol, always -
      // not by how a near-naught sum of the bonds rounds)
      expect(nh.text).toBe("NH");
    }
    // (nearly so, the row clearer by less than the band: stacked, as it always was)
    expect(at(47, 227).stack).toBeDefined();
  });

  it("writes a three-bond label's H on the row's clearer side, never on a bond, where the row is clearer than the line above or below", () => {
    const L = NOMINAL_BOND_LENGTH;
    const v = (deg: number) => ({ x: L * Math.cos((deg * Math.PI) / 180), y: L * Math.sin((deg * Math.PI) / 180) });
    const label = (el: string, charge: number, ...degs: number[]) => {
      const atoms: Atom[] = [{ id: 1, x: 0, y: 0, el, charge }, ...degs.map((d, k) => ({ id: k + 2, ...v(d), el: "C" }))];
      const [l] = buildTextLabels(
        atoms,
        opts(),
        degs.map((_, k) => ({ a1: 0, a2: k + 1, order: 1 })),
      );
      return l;
    };
    // (a borate's BH- and an ammonium's NH+, a bond straight right: the H before the symbol, clear of it)
    for (const [el, charge] of [
      ["B", -1],
      ["N", 1],
    ] as const) {
      const l = label(el, charge, 0, 120, 240);
      expect(l.stack).toBeUndefined();
      expect(l.text.startsWith("H"), l.text).toBe(true);
    }
    expect(label("N", 1, 5, 125, 245).text.startsWith("H")).toBe(true);
    // (a bond straight left: the H after the symbol)
    const b = label("B", -1, 180, 60, 300);
    expect(b.stack).toBeUndefined();
    expect(b.text.startsWith("BH"), b.text).toBe(true);
  });

  it("writes them on the side further from every bond where three spread evenly, a hair either way", () => {
    const L = NOMINAL_BOND_LENGTH;
    const v = (deg: number) => ({ x: L * Math.cos((deg * Math.PI) / 180), y: L * Math.sin((deg * Math.PI) / 180) });
    const at = (...degs: number[]) => {
      const atoms: Atom[] = [{ id: 1, x: 0, y: 0, el: "B", charge: -1 }, ...degs.map((d, k) => ({ id: k + 2, ...v(d), el: "O" }))];
      const [bh] = buildTextLabels(atoms, opts(), degs.map((_, k) => ({ a1: 0, a2: k + 1, order: 1 })));
      return bh.stack;
    };
    // a borate's BH, one bond straight down: the H above, clear of it
    for (const e of [0, 1e-9, -1e-9]) expect(at(30 + e, 150 - e, 270 + e)).toBe("above");
    // and one straight up: below
    for (const e of [0, 1e-9, -1e-9]) expect(at(90 + e, 210 - e, 330 + e)).toBe("below");
  });

  it("writes a carbon with no bonds as CH4, and a bonded one not at all", () => {
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 5, y: 0, el: "C" },
      { id: 3, x: 6.5, y: 0, el: "C" },
    ];
    const labels = buildTextLabels(atoms, opts(), [{ a1: 1, a2: 2, order: 1 }]);
    expect(labels.map((t) => t.text)).toEqual(["CH4"]);
    expect(labels[0].atom).toBe(0);
  });

  it("writes an atom on its own as its formula is written: H2O, HCl, H3O+, but NH3", () => {
    const alone = (el: string, charge?: number) =>
      buildTextLabels([{ id: 1, x: 0, y: 0, el, ...(charge ? { charge } : {}) }], opts(), [])[0];
    const water = alone("O");
    expect(water.text).toBe("H2O");
    expect(water.runs).toEqual([{ text: "H" }, { text: "2", sub: true }, { text: "O" }]);
    // the oxygen still sits on the atom
    expect(water.anchorRun).toBe(2);
    expect(alone("S").text).toBe("H2S");
    expect(alone("Cl").text).toBe("HCl");
    expect(alone("Br").text).toBe("HBr");
    // the charge after the symbol, where the hydrogens come first
    expect(alone("O", 1).text).toBe("H3O+");
    expect(alone("O", -1).text).toBe("HO\u2212");
    // the rest keep the symbol first
    expect(alone("N").text).toBe("NH3");
    expect(alone("N", 1).text).toBe("NH4+");
    expect(alone("P").text).toBe("PH3");
    expect(alone("C").text).toBe("CH4");
  });

  // O bonded to a carbon that sits up and to the left
  const hydroxyl: Atom[] = [
    { id: 1, x: 0, y: 0, el: "C" },
    { id: 2, x: 1.3, y: -0.75, el: "O" },
  ];
  const oneBond: Bond[] = [{ a1: 0, a2: 1, order: 1 }];

  it("writes the hydrogens an atom carries", () => {
    const [label] = buildTextLabels(hydroxyl, opts(), oneBond);
    expect(label.text).toBe("OH");
    expect(label.runs).toEqual([{ text: "O" }, { text: "H" }]);
    // the element symbol is what sits on the atom
    expect(label.anchorRun).toBe(0);
  });

  it("puts a count in a subscript run", () => {
    const amine: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.3, y: -0.75, el: "N" },
    ];
    const [, ...rest] = buildTextLabels(amine, opts(), oneBond);
    const label = rest[0] ?? buildTextLabels(amine, opts(), oneBond)[0];
    expect(label.text).toBe("NH2");
    expect(label.runs).toEqual([
      { text: "N" },
      { text: "H" },
      { text: "2", sub: true },
    ]);
  });

  it("keeps the hydrogens away from the bonds", () => {
    // neighbour on the right: the label has to read HO, anchored on the O
    const rightward: Atom[] = [
      { id: 1, x: 0, y: 0, el: "O" },
      { id: 2, x: 1.3, y: 0, el: "C" },
    ];
    const [label] = buildTextLabels(rightward, opts(), oneBond);
    expect(label.text).toBe("HO");
    expect(label.runs?.[label.anchorRun ?? 0]).toEqual({ text: "O" });
  });

  it("writes OH for a bond within 10 degrees of vertical, whichever way it leans", () => {
    // the neighbour sits `deg` degrees right of straight up (or down) from O
    const at = (deg: number, below = false): Atom[] => {
      const t = (deg * Math.PI) / 180;
      return [
        { id: 1, x: 0, y: 0, el: "O" },
        { id: 2, x: 1.3 * Math.sin(t), y: (below ? -1.3 : 1.3) * Math.cos(t), el: "C" },
      ];
    };
    const text = (atoms: Atom[]) => buildTextLabels(atoms, opts(), oneBond)[0].text;
    for (const below of [false, true]) {
      expect(text(at(0, below))).toBe("OH");
      expect(text(at(1e-4, below))).toBe("OH");
      expect(text(at(9.9, below))).toBe("OH");
      expect(text(at(-30, below))).toBe("OH");
      expect(text(at(10.1, below))).toBe("HO");
      expect(text(at(30, below))).toBe("HO");
    }
  });

  it("leaves carbons unlabelled and can be switched off", () => {
    expect(buildTextLabels(hydroxyl, opts(), oneBond)).toHaveLength(1);
    const plain = buildTextLabels(
      hydroxyl,
      opts({ showImplicitHydrogens: false }),
      oneBond,
    );
    expect(plain[0].text).toBe("O");
  });

  it("does not depend on bonds being given", () => {
    const [label] = buildTextLabels(
      [{ id: 1, x: 0, y: 0, el: "Cl" }],
      opts(),
      [],
    );
    // no bonds known: Cl carries one hydrogen, written first as on its own
    expect(label.text).toBe("HCl");
  });
});

describe("wedge geometry", () => {
  // the camera zoom the canvas draws at; world sizes are converted with it
  const ZOOM = 40;
  // the outline before the corners are rounded
  const raw = (over: Partial<LayoutOptions> = {}) =>
    opts({ joinStyle: "sharp", ...over });
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 0, el: "C" }, // stereocentre, higher degree
    { id: 2, x: 1.5, y: 0, el: "C" },
  ];
  const deg = new Map([
    [0, 3],
    [1, 1],
  ]);
  const wedge: Bond = { a1: 0, a2: 1, order: 1, stereo: "up" };

  it("ends in a flat tip as wide as a bond, not a point", () => {
    const o = raw();
    const { polys } = buildBondPrimitives(atoms, wedge, o, ZOOM, deg);
    expect(polys).toHaveLength(1);
    const pts = polys[0].points;
    expect(pts).toHaveLength(4);

    // the tip is at the stereocentre (x = 0); its two corners straddle the
    // bond axis by half a line width
    const tip = pts.filter((p) => p.x < 0.75);
    expect(tip).toHaveLength(2);
    const halfWidth = Math.abs(tip[0].y - tip[1].y) / 2;
    expect(halfWidth).toBeCloseTo(o.lineWidthPx / 2, 6);

    // and it reaches just past the atom, so the join has no notch
    for (const p of tip) expect(p.x).toBeLessThan(0);
    for (const p of tip) expect(p.x).toBeGreaterThan(-o.lineWidthPx);
  });

  it("keeps the wide end at the far atom", () => {
    const o = raw();
    const { polys } = buildBondPrimitives(atoms, wedge, o, ZOOM, deg);
    const base = polys[0].points.filter((p) => p.x > 0.75);
    expect(base).toHaveLength(2);
    expect(Math.abs(base[0].y - base[1].y)).toBeCloseTo(o.wedgeWidthPx, 6);
  });

  it("is as broad at its wide end with round ends as with square ones, the rounding set out by as much as it draws in", () => {
    // (Meno's: the corners rounded by half a line, which drew the end in to
    // 2.95 pt of its 3.0, the wedge's long sides leaning in to its tip)
    for (const length of [1.5, 3]) {
      const long: Atom[] = [atoms[0], { ...atoms[1], x: length }];
      const o = opts({ joinStyle: "round" });
      const { polys } = buildBondPrimitives(long, wedge, o, ZOOM, deg);
      const ys = polys[0].points.map((p) => p.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(o.wedgeWidthPx, 6);
      // (still round: the broad end's corners are arcs)
      expect(polys[0].points.length).toBeGreaterThan(8);
    }
  });

  it("cuts the wide end along a bond that continues from it", () => {
    // stereocentre at 0, wide end at 1, which carries on to 2
    const chain: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.5, y: 0, el: "C" },
      { id: 3, x: 2.3, y: -1.3, el: "C" },
    ];
    const chainDeg = new Map([
      [0, 3],
      [1, 2],
      [2, 1],
    ]);
    const chainBonds: Bond[] = [
      wedge,
      { a1: 1, a2: 2, order: 1, stereo: "none" },
    ];
    const adj = new Map([
      [0, [chainBonds[0]]],
      [1, [chainBonds[0], chainBonds[1]]],
      [2, [chainBonds[1]]],
    ]);
    const o = raw();
    const { polys } = buildBondPrimitives(
      chain,
      wedge,
      o,
      ZOOM,
      chainDeg,
      undefined,
      undefined,
      adj,
    );
    const base = polys[0].points.filter((p) => p.x > 0.75);
    expect(base).toHaveLength(2);
    // the cut runs parallel to the continuing bond
    const cut = { x: base[0].x - base[1].x, y: base[0].y - base[1].y };
    const bond = { x: 2.3 - 1.5, y: -1.3 };
    expect(cut.x * bond.y - cut.y * bond.x).toBeCloseTo(0, 6);
    // and along its far edge, so the bond is taken in whole: with nothing
    // else at the atom, that edge is the one carrying the outline round
    const len = Math.hypot(bond.x, bond.y);
    const n0 = { x: -bond.y / len, y: bond.x / len };
    const towardsTip = n0.x * (0 - 1.5) >= 0 ? 1 : -1;
    for (const p of base) {
      const off = ((p.x - 1.5) * n0.x + (p.y - 0) * n0.y) * towardsTip;
      expect(off).toBeCloseTo(-o.lineWidthPx / 2, 6);
    }
  });

  it("leaves the wide end square when a bond runs along the wedge", () => {
    // the bond at the wide end doubles back at a shallow angle: cutting to it
    // would draw the wedge out into a spike
    const shallow: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.5, y: 0, el: "C" },
      { id: 3, x: -1.41, y: -0.51, el: "C" },
    ];
    const shallowBonds: Bond[] = [
      { a1: 1, a2: 0, order: 1, stereo: "up" },
      { a1: 0, a2: 2, order: 1, stereo: "none" },
    ];
    const shallowDeg = new Map([
      [0, 2],
      [1, 3],
      [2, 1],
    ]);
    const o = raw();
    const { polys } = buildBondPrimitives(
      shallow,
      shallowBonds[0],
      o,
      ZOOM,
      shallowDeg,
      undefined,
      undefined,
      new Map([
        [0, [shallowBonds[0], shallowBonds[1]]],
        [1, [shallowBonds[0]]],
        [2, [shallowBonds[1]]],
      ]),
    );
    const base = polys[0].points.filter((p) => p.x < 0.75);
    expect(base).toHaveLength(2);
    // square, not stretched along the wedge: both corners at the same place
    // along it, a cap's width behind the atom so they cover the join cap
    expect(base[0].x).toBeCloseTo(base[1].x, 9);
    for (const p of base) {
      expect(p.x).toBeLessThanOrEqual(0);
      expect(p.x).toBeGreaterThanOrEqual(-o.lineWidthPx);
    }
  });

  it("leaves the wide end square when nothing continues from it", () => {
    const o = raw();
    const { polys } = buildBondPrimitives(atoms, wedge, o, ZOOM, deg);
    const base = polys[0].points.filter((p) => p.x > 0.75);
    expect(base[0].x).toBeCloseTo(base[1].x, 12);
  });

  it("starts a hashed wedge a line width wide, not at a point", () => {
    const o = raw();
    const hashed: Bond = { ...wedge, stereo: "down" };
    const { polys } = buildBondPrimitives(atoms, hashed, o, ZOOM, deg);
    const hashes = hashesOf(polys);
    expect(hashes.length).toBeGreaterThan(3);
    // a pointed wedge used to begin with a hash of almost no length
    expect(hashes[0].nearWidth).toBeCloseTo(o.lineWidthPx, 9);
    for (const h of hashes) {
      expect(h.farWidth).toBeLessThanOrEqual(o.wedgeWidthPx + 1e-9);
    }
  });

  it("stops a wedge's narrow end at a label where a line would stop", () => {
    const labelled: Atom[] = [{ ...atoms[0], el: "N" }, atoms[1]];
    const plain: Bond = { a1: 0, a2: 1, order: 1 };
    const lineStart = (o: LayoutOptions) => {
      const [l] = buildBondPrimitives(labelled, plain, o, ZOOM, deg).lines;
      return Math.min(l.x1, l.x2);
    };
    const tip = (o: LayoutOptions) =>
      Math.min(
        ...buildBondPrimitives(labelled, wedge, o, ZOOM, deg).polys[0].points.map(
          (p) => p.x,
        ),
      );
    // square: flat, just where the line stops
    const square = raw();
    expect(lineStart(square)).toBeGreaterThan(0);
    expect(tip(square)).toBeCloseTo(lineStart(square), 9);
    // round: rounded about that point, as the line's cap is
    const round = opts({ joinStyle: "round" });
    expect(tip(round)).toBeCloseTo(lineStart(round) - round.lineWidthPx / 2, 6);
  });
});

describe("roundPolyCorners", () => {
  const square: Vec2[] = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ];
  it("rounds a corner to the radius asked for", () => {
    const r = 0.25;
    const out = roundPolyCorners(square, r);
    // each corner loses the bit outside the arc; the arc itself is drawn as
    // segments, so the area lands just inside the exact figure
    const exact = 4 - (4 - Math.PI) * r * r;
    expect(polyArea(out)).toBeGreaterThan(exact * 0.995);
    expect(polyArea(out)).toBeLessThanOrEqual(exact);
    for (const p of out) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("keeps the shape when there is no room for the radius", () => {
    // a radius wider than the shape itself still stays inside it
    const out = roundPolyCorners(square, 10);
    expect(polyArea(out)).toBeLessThanOrEqual(4);
    expect(polyArea(out)).toBeGreaterThan(2);
  });

  it("leaves a polygon alone when the radius is zero", () => {
    expect(roundPolyCorners(square, 0)).toBe(square);
  });
});

describe("mitreJoinPolys", () => {
  it("fills each gap out to where the two outlines cross", () => {
    // two bonds 120 degrees apart
    const dirs: Vec2[] = [
      { x: 1, y: 0 },
      { x: Math.cos((2 * Math.PI) / 3), y: Math.sin((2 * Math.PI) / 3) },
    ];
    const h = 0.05;
    const polys = mitreJoinPolys({ x: 0, y: 0 }, dirs, h);
    expect(polys).toHaveLength(2);
    for (const p of polys) {
      expect(p.points).toHaveLength(4);
      const apex = p.points[2];
      // the mitre point of two outlines h from the centre
      const gap = Math.hypot(apex.x, apex.y);
      expect(gap).toBeGreaterThan(h);
      expect(gap).toBeLessThan(h * 4);
    }
  });

  it("cuts the mitre off when the gap is too shallow for it", () => {
    const dirs: Vec2[] = [
      { x: 1, y: 0 },
      { x: Math.cos(0.05), y: Math.sin(0.05) },
    ];
    const polys = mitreJoinPolys({ x: 0, y: 0 }, dirs, 0.05);
    const squared = polys.filter((p) => p.points.length === 3);
    expect(squared.length).toBeGreaterThan(0);
  });

  it("needs two bonds", () => {
    expect(mitreJoinPolys({ x: 0, y: 0 }, [{ x: 1, y: 0 }], 0.05)).toEqual([]);
  });
});

describe("joinStyle", () => {
  // a bent chain with a wedge whose wide end carries two bonds on
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 1.5, el: "C" },
    { id: 2, x: 0, y: 0, el: "C" },
    { id: 3, x: 1.3, y: -0.75, el: "C" },
    { id: 4, x: -1.3, y: -0.75, el: "C" },
    // a plain corner well away from the wedge
    { id: 5, x: 2.6, y: 0, el: "C" },
  ];
  const bonds: Bond[] = [
    { a1: 0, a2: 1, order: 1, stereo: "up", stereoOrient: "reverse" },
    { a1: 1, a2: 2, order: 1, stereo: "none" },
    { a1: 1, a2: 3, order: 1, stereo: "none" },
    { a1: 2, a2: 4, order: 1, stereo: "none" },
  ];

  it("rounds the wedge and caps the joins when ends are round", () => {
    const o = opts({ joinStyle: "round" });
    const { polys, fills } = buildAllPrimitives(atoms, bonds, o, 40);
    expect(fills.length).toBeGreaterThan(0);
    // a cap at the plain corner, and the wedge drawn as arcs not corners
    expect(polys).toHaveLength(1);
    expect(polys[0].points.length).toBeGreaterThan(8);
  });

  it("rounds only the corners no bond runs into", () => {
    const wedgeOf = (o: LayoutOptions) => {
      const { polys } = buildAllPrimitives(atoms, bonds, o, 40);
      return polys.reduce((big, p) =>
        polyArea(p.points) > polyArea(big.points) ? p : big,
      );
    };
    const cut = wedgeOf(opts({ joinStyle: "round" })).points;
    const square = wedgeOf(opts({ joinStyle: "sharp" })).points;
    // the wide end is cut along two bonds, so those corners and the dent are
    // left as they are; only the free narrow end is rounded
    for (const p of square.slice(0, 3)) {
      expect(
        cut.some(
          (q) => Math.abs(q.x - p.x) < 1e-9 && Math.abs(q.y - p.y) < 1e-9,
        ),
      ).toBe(true);
    }
    expect(cut.length).toBeGreaterThan(square.length);
  });

  it("dents in to the atom, where the join is filled", () => {
    const o = opts({ joinStyle: "sharp" });
    const { polys } = buildAllPrimitives(atoms, bonds, o, 40);
    const wedge = polys.reduce((big, p) =>
      polyArea(p.points) > polyArea(big.points) ? p : big,
    );
    const dent = wedge.points[1];
    // the branching atom itself
    expect(dent.x).toBeCloseTo(0, 9);
    expect(dent.y).toBeCloseTo(0, 9);
  });

  it("mitres the joins and leaves the wedge cut when asked", () => {
    const o = opts({ joinStyle: "sharp" });
    const { polys, fills } = buildAllPrimitives(atoms, bonds, o, 40);
    expect(fills).toHaveLength(0);
    // the wedge is the shape with some size to it; the joins are slivers
    const wedge = polys.reduce((big, p) =>
      polyArea(p.points) > polyArea(big.points) ? p : big,
    );
    // base left, dent, base right, and the two tip corners
    expect(wedge.points).toHaveLength(5);
    // the dent points back towards the thin end
    const dent = wedge.points[1];
    expect(dent.y).toBeGreaterThan(wedge.points[0].y);
    expect(dent.y).toBeGreaterThan(wedge.points[2].y);
    // and the joins are filled
    expect(polys.length).toBeGreaterThan(1);
  });
});

describe("how a bond ends", () => {
  // a chain ending free, a hashed wedge, and a labelled atom
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 0, el: "C" },
    { id: 2, x: 1.5, y: 0, el: "C" },
    { id: 3, x: 2.3, y: 1.3, el: "C" },
    { id: 4, x: 2.3, y: -1.3, el: "O" },
  ];
  const bonds: Bond[] = [
    { a1: 0, a2: 1, order: 1, stereo: "none" },
    { a1: 1, a2: 2, order: 1, stereo: "down" },
    { a1: 1, a2: 3, order: 1, stereo: "none" },
  ];
  const capAt = (fills: { c: Vec2 }[], a: Atom) =>
    fills.some((f) => Math.hypot(f.c.x - a.x, f.c.y - a.y) < 1e-9);

  it("rounds a free end as much as a join", () => {
    const o = opts({ joinStyle: "round" });
    const { fills } = buildAllPrimitives(atoms, bonds, o, 40);
    expect(capAt(fills, atoms[0])).toBe(true); // the end of the chain
    expect(capAt(fills, atoms[1])).toBe(true); // where the bonds meet
    for (const f of fills) expect(f.r).toBeCloseTo(o.lineWidthPx / 2, 9);
  });

  it("leaves a hashed wedge and a label alone", () => {
    const { fills } = buildAllPrimitives(atoms, bonds, opts({ joinStyle: "round" }), 40);
    // a cap past the last hash would read as a loose dot
    expect(capAt(fills, atoms[2])).toBe(false);
    // a label takes the bond's end with it
    expect(capAt(fills, atoms[3])).toBe(false);
  });

  it("ends flat when asked for sharp joins", () => {
    const { fills } = buildAllPrimitives(
      atoms,
      bonds,
      opts({ joinStyle: "sharp" }),
      40,
    );
    expect(fills).toHaveLength(0);
  });
});

describe("a hashed wedge and its neighbours", () => {
  const ZOOM = 40;
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 0, el: "C" }, // stereocentre
    { id: 2, x: 1.5, y: 0, el: "C" },
  ];
  const deg = new Map([
    [0, 3],
    [1, 1],
  ]);
  const hashed: Bond = { a1: 0, a2: 1, order: 1, stereo: "down" };

  it("cuts the hashes from a wedge, one hash spacing out to flush with the wide end", () => {
    const o = opts();
    const { lines, polys } = buildBondPrimitives(atoms, hashed, o, ZOOM, deg);
    // square ends: each hash is a trapezoid, not a line
    expect(lines).toHaveLength(0);
    const hashes = hashesOf(polys);
    const lw = o.lineWidthPx;
    const s = o.hashSpacingPx;
    // the first one hash spacing out from the stereocentre, the last flush
    // with the wide end, and as many between as fit a hash spacing apart
    expect(hashes[0].near).toBeCloseTo(s, 9);
    expect(hashes[hashes.length - 1].far).toBeCloseTo(1.5, 9);
    expect(hashes).toHaveLength(1 + Math.floor((1.5 - s - lw) / s));
    const gaps = hashes.slice(1).map((h, i) => h.at - hashes[i].at);
    for (const g of gaps) {
      expect(g).toBeCloseTo(gaps[0], 9);
      expect(g).toBeGreaterThanOrEqual(s);
    }
    // each a line width deep, its ends on an outline running from a line
    // width at the first hash to the full broad end at the last
    const width = (x: number) =>
      lw + ((o.wedgeWidthPx - lw) * (x - s)) / (1.5 - s);
    for (const h of hashes) {
      expect(h.far - h.near).toBeCloseTo(lw, 9);
      expect(h.nearWidth).toBeCloseTo(width(h.near), 9);
      expect(h.farWidth).toBeCloseTo(width(h.far), 9);
    }
  });

  it("rounds each hash when ends are round, as far across as the trapezoid at its middle", () => {
    const o = opts({ joinStyle: "round" });
    const square = hashesOf(
      buildBondPrimitives(atoms, hashed, opts(), ZOOM, deg).polys,
    );
    const { lines, polys, ends } = buildBondPrimitives(atoms, hashed, o, ZOOM, deg);
    expect(polys).toHaveLength(0);
    expect(lines).toHaveLength(square.length);
    // a cap on each end of each hash
    expect(ends).toHaveLength(2 * lines.length);
    lines.forEach((l, i) => {
      const h = square[i];
      expect((l.x1 + l.x2) / 2).toBeCloseTo(h.at, 9);
      // the caps reach half a line width past either end
      expect(Math.hypot(l.x2 - l.x1, l.y2 - l.y1) + o.lineWidthPx).toBeCloseTo(
        (h.nearWidth + h.farWidth) / 2,
        9,
      );
    });
  });

  it("starts the hashes where a label at the stereocentre leaves off", () => {
    const o = opts();
    const labelled: Atom[] = [{ ...atoms[0], el: "N" }, atoms[1]];
    const [line] = buildBondPrimitives(
      labelled,
      { a1: 0, a2: 1, order: 1 },
      o,
      ZOOM,
      deg,
    ).lines;
    const from = Math.min(line.x1, line.x2);
    expect(from).toBeGreaterThan(o.hashSpacingPx);
    const hashes = hashesOf(buildBondPrimitives(labelled, hashed, o, ZOOM, deg).polys);
    // flush with where a line would start, and a line width wide there: the
    // wedge starts again from the label rather than losing its narrow end
    expect(hashes[0].near).toBeCloseTo(from, 9);
    expect(hashes[0].nearWidth).toBeCloseTo(o.lineWidthPx, 9);
    const last = hashes[hashes.length - 1];
    expect(last.far).toBeCloseTo(1.5, 9);
    expect(last.farWidth).toBeCloseTo(o.wedgeWidthPx, 9);
  });

  it("widens the hashes to the full broad end at a label at the wide end", () => {
    const o = opts();
    const labelled: Atom[] = [atoms[0], { ...atoms[1], el: "O" }];
    const [line] = buildBondPrimitives(
      labelled,
      { a1: 0, a2: 1, order: 1 },
      o,
      ZOOM,
      deg,
    ).lines;
    const to = Math.max(line.x1, line.x2);
    expect(to).toBeLessThan(1.5);
    const hashes = hashesOf(buildBondPrimitives(labelled, hashed, o, ZOOM, deg).polys);
    expect(hashes[0].near).toBeCloseTo(o.hashSpacingPx, 9);
    // it ends where a line would, as broad there as it ever is
    const last = hashes[hashes.length - 1];
    expect(last.far).toBeCloseTo(to, 9);
    expect(last.farWidth).toBeCloseTo(o.wedgeWidthPx, 9);
  });
});

describe("a wedge and a bond of more than one line", () => {
  // the wide end of the wedge sits on atom 1, where a double bond carries on
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 1.5, el: "C" },
    { id: 2, x: 0, y: 0, el: "C" },
    { id: 3, x: 1.5, y: 0, el: "C" },
    { id: 4, x: -1.3, y: -0.75, el: "C" },
  ];
  const bonds: Bond[] = [
    { a1: 0, a2: 1, order: 1, stereo: "up", stereoOrient: "reverse" },
    { a1: 1, a2: 2, order: 2, stereo: "none" },
    { a1: 1, a2: 3, order: 1, stereo: "none" },
  ];

  it("closes a centred double bond's gap with the wedge, neither line ending in mid air", () => {
    const o = opts();
    const half = o.lineWidthPx / 2;
    const { polys, lines } = buildAllPrimitives(atoms, bonds, o, 40);
    const wedge = polys.reduce((big, p) =>
      polyArea(p.points) > polyArea(big.points) ? p : big,
    );
    // the double bond runs along +x from the atom, drawn centred: a line
    // either side, the near one towards the wedge's narrow end (above)
    const pair = lines.filter((l) => Math.max(l.x1, l.x2) > 1);
    expect(pair.length).toBe(2);
    const [far, near] = [...pair].sort((a, b) => a.y1 - b.y1);
    const atomEnd = (l: (typeof pair)[number]) =>
      l.x1 < l.x2 ? { x: l.x1, y: l.y1 } : { x: l.x2, y: l.y2 };
    // the near line runs into the wedge
    expect(inside(atomEnd(near), wedge.points)).toBe(true);
    // the far one runs on past the atom to meet the plain bond leaving it on
    // that side: its end is on that bond's line
    const end = atomEnd(far);
    const u = { x: -1.3 / Math.hypot(1.3, 0.75), y: -0.75 / Math.hypot(1.3, 0.75) };
    expect(Math.abs(end.x * u.y - end.y * u.x)).toBeLessThanOrEqual(half + 1e-9);
    // and the wedge stops short of the far line, closing the gap between the
    // two rather than reaching across it to stand out beneath
    const under = Math.min(...wedge.points.map((p) => p.y));
    expect(under).toBeGreaterThan(far.y1 + half);
  });

  it("stops at a double bond's own line on the side its second line is not", () => {
    // the wedge's wide end on atom 1, where only a double bond carries on,
    // its second line on the side of the wedge's narrow end (+y)
    const alone: Bond[] = [
      { a1: 0, a2: 1, order: 1, stereo: "up", stereoOrient: "reverse" },
      { a1: 1, a2: 2, order: 2, stereo: "none", doubleMode: "left" },
    ];
    const o = opts();
    const { polys, lines } = buildAllPrimitives(atoms.slice(0, 3), alone, o, 40);
    const wedge = polys.reduce((big, p) =>
      polyArea(p.points) > polyArea(big.points) ? p : big,
    );
    expect(Math.max(...lines.map((l) => l.y1))).toBeGreaterThan(0);
    // nothing of the bond is below its own line, so no corner of the wedge
    // stands out below that line's edge
    const under = Math.min(...wedge.points.map((p) => p.y));
    expect(under).toBeGreaterThanOrEqual(-o.lineWidthPx / 2 - 1e-9);
  });

  it("leaves a second line in the dent between two bonds short of the wedge", () => {
    // as before, a plain bond carrying on too, and the double bond's second
    // line on its side (-y), in the dent between the two
    const sided: Bond[] = [bonds[0], { ...bonds[1], doubleMode: "right" }, bonds[2]];
    const o = opts();
    const { polys } = buildAllPrimitives(atoms, sided, o, 40);
    const wedge = polys.reduce((big, p) =>
      polyArea(p.points) > polyArea(big.points) ? p : big,
    );
    // its corner on the double bond's side keeps to that bond's own line,
    // the edge nearest the narrow end, and is not drawn down towards the
    // second line, which runs it into a spike
    const corner = wedge.points.filter((p) => p.x > 0.05 && p.y < 0.75);
    expect(corner.length).toBeGreaterThan(0);
    for (const p of corner) expect(p.y).toBeGreaterThanOrEqual(o.lineWidthPx / 2 - 1e-9);
  });

  it("runs a line of a double bond up to the atom the wedge covers", () => {
    const o = opts();
    const { lines } = buildAllPrimitives(atoms, bonds, o, 40);
    // both lines start at the atom, not held back from it
    for (const l of lines.filter((s) => s.x1 > -0.1 && s.x2 > 1)) {
      expect(l.x1).toBeCloseTo(0, 6);
    }
  });
});

describe("how far a bond reaches off its own line", () => {
  const ZOOM = 40;
  const pair: Atom[] = [
    { id: 1, x: 0, y: 0, el: "C" },
    { id: 2, x: 1.5, y: 0, el: "C" },
  ];
  const reachOf = (bond: Bond) => layoutMolecule(pair, [bond], opts(), ZOOM).reach[0];
  const o = opts();
  const line = o.lineWidthPx / 2;

  it("is half a line's width for a plain bond", () => {
    expect(reachOf({ a1: 0, a2: 1, order: 1 })).toEqual({ left1: line, right1: line, left2: line, right2: line });
  });

  it("widens to a wedge's broad end at the end it is drawn at", () => {
    // with nothing else at either atom the narrow end is at a1
    const r = reachOf({ a1: 0, a2: 1, order: 1, stereo: "up" });
    expect(r.left1).toBeCloseTo(line, 9);
    expect(r.left2).toBeCloseTo(o.wedgeWidthPx / 2, 9);
    expect(r.right2).toBeCloseTo(o.wedgeWidthPx / 2, 9);
    const hashed = reachOf({ a1: 0, a2: 1, order: 1, stereo: "down" });
    expect(hashed.left2).toBeCloseTo(o.wedgeWidthPx / 2, 9);
  });

  it("reaches a double bond's second line on its side, or half the gap either side when centred", () => {
    const left = reachOf({ a1: 0, a2: 1, order: 2, doubleMode: "left" });
    expect(left.left1).toBeCloseTo(line + o.doubleOffsetPx, 9);
    expect(left.right1).toBeCloseTo(line, 9);
    const right = reachOf({ a1: 0, a2: 1, order: 2, doubleMode: "right" });
    expect(right.right2).toBeCloseTo(line + o.doubleOffsetPx, 9);
    expect(right.left2).toBeCloseTo(line, 9);
    const centred = reachOf({ a1: 0, a2: 1, order: 2, doubleMode: "center" });
    expect(centred.left1).toBeCloseTo(line + o.doubleOffsetPx / 2, 9);
    expect(centred.right1).toBeCloseTo(line + o.doubleOffsetPx / 2, 9);
  });

  it("reaches a triple bond's outer lines and a wavy bond's swing", () => {
    expect(reachOf({ a1: 0, a2: 1, order: 3 }).left1).toBeCloseTo(line + o.tripleOffsetPx, 9);
    expect(reachOf({ a1: 0, a2: 1, order: 1, stereo: "wavy" }).right2).toBeCloseTo(line + o.wavyAmpPx, 9);
  });

  it("gives every bond one, in the bonds' order", () => {
    const three: Atom[] = [...pair, { id: 3, x: 2.8, y: 0.75, el: "C" }];
    const { reach } = layoutMolecule(
      three,
      [
        { a1: 0, a2: 1, order: 1 },
        { a1: 1, a2: 2, order: 1, stereo: "up" },
      ],
      opts(),
      ZOOM,
    );
    expect(reach).toHaveLength(2);
    expect(reach[0].left2).toBeCloseTo(line, 9);
    expect(Math.max(reach[1].left1, reach[1].left2)).toBeCloseTo(o.wedgeWidthPx / 2, 9);
  });
});

describe("a label must not change how a bond is drawn", () => {
  const ZOOM = 40;
  const deg = new Map([
    [0, 3],
    [1, 1],
  ]);
  const pair = (el: string): Atom[] => [
    { id: 1, x: 0, y: 0, el: "C" },
    { id: 2, x: 1.5, y: 0, el },
  ];
  const spacing = (hashes: { at: number }[]) =>
    hashes.slice(1).map((h, i) => h.at - hashes[i].at);

  it("spaces a hashed wedge's hashes evenly, never closer than the hash spacing", () => {
    const o = opts();
    const bond: Bond = { a1: 0, a2: 1, order: 1, stereo: "down" };
    const plain = hashesOf(buildBondPrimitives(pair("C"), bond, o, ZOOM, deg).polys);
    const labelled = hashesOf(
      buildBondPrimitives(pair("O"), bond, o, ZOOM, deg).polys,
    );
    // the bond to a labelled atom is shorter, so it carries fewer hashes -
    // each set evenly spaced, and never closer than the hash spacing
    expect(labelled.length).toBeLessThan(plain.length);
    for (const gaps of [spacing(plain), spacing(labelled)]) {
      for (const g of gaps) {
        expect(g).toBeCloseTo(gaps[0], 9);
        expect(g).toBeGreaterThanOrEqual(o.hashSpacingPx - 1e-9);
      }
    }
  });

  it("keeps the wave of a wavy bond the same length", () => {
    const o = opts();
    const bond: Bond = { a1: 0, a2: 1, order: 1, stereo: "wavy" };
    // where the wave crosses the bond's own line: half a wavelength apart,
    // and at the same places along the bond whatever is drawn of it
    const crossings = (atoms: Atom[]) => {
      const out: number[] = [];
      for (const l of buildBondPrimitives(atoms, bond, o, ZOOM, deg).lines) {
        if (l.y1 === 0 || l.y1 * l.y2 < 0) {
          const f = l.y1 === 0 ? 0 : l.y1 / (l.y1 - l.y2);
          out.push(l.x1 + (l.x2 - l.x1) * f);
        }
      }
      return out;
    };
    const plain = crossings(pair("C"));
    const labelled = crossings(pair("O"));
    expect(labelled.length).toBeLessThan(plain.length);
    for (const x of labelled) {
      expect(plain.some((p) => Math.abs(p - x) < 0.02)).toBe(true);
    }
  });
});

describe("labels and the room they need", () => {
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 0, el: "C" },
    { id: 2, x: 1.5, y: 0, el: "N" }, // NH2, hanging to the right
  ];
  const bonds: Bond[] = [{ a1: 0, a2: 1, order: 1, stereo: "none" }];

  it("makes room for a label in the drawing's bounds", () => {
    const o = opts();
    const layout = layoutMolecule(atoms, bonds, o, 40);
    // the label reaches past its atom, and the drawing has to include it
    expect(layout.bounds.max.x).toBeGreaterThan(1.5 + o.fontPx * 0.2);
    expect(layout.bounds.max.y).toBeGreaterThan(0);
    expect(layout.bounds.min.y).toBeLessThan(0);
  });

  it("stops where the label actually reaches, not at a fixed distance", () => {
    const o = opts();
    const endingAt = (el: string, over: Partial<LayoutOptions> = {}) =>
      layoutMolecule(
        [
          { id: 1, x: 0, y: 0, el: "C" },
          { id: 2, x: 1.5, y: 0, el },
        ],
        bonds,
        { ...o, ...over },
        40,
      ).lines[0].x2;
    // a wide symbol takes more room than a narrow one, side on
    expect(endingAt("Br")).toBeLessThan(endingAt("I"));
    // and the hydrogens, which hang the other way, take none of it
    expect(endingAt("O")).toBeCloseTo(
      endingAt("O", { showImplicitHydrogens: false }),
      6,
    );
  });

  it("does not hold a bond off a label it barely meets", () => {
    const o = opts();
    // straight down onto the same label: only its height is in the way
    const above = layoutMolecule(
      [
        { id: 1, x: 1.5, y: 1.5, el: "C" },
        { id: 2, x: 1.5, y: 0, el: "N" },
      ],
      bonds,
      o,
      40,
    ).lines[0];
    const gap = Math.min(above.y1, above.y2);
    expect(gap).toBeLessThan(o.fontPx * 0.6);
    expect(gap).toBeGreaterThan(0);
  });
});

describe("a label as ACS 1996 sets it", () => {
  const size = 10;
  const label = (runs: { text: string; sub?: boolean }[], anchorRun = 0) => ({
    x: 0,
    y: 0,
    text: runs.map((r) => r.text).join(""),
    fontPx: size,
    runs,
    anchorRun,
  });

  it("centres the element symbol on the atom, on a baseline 0.4 of the size below it", () => {
    const [n] = placeLabel(label([{ text: "N" }]), size);
    expect(n.x).toBeCloseTo((-advanceEm("N") * size) / 2, 12);
    expect(n.y).toBeCloseTo(-4, 12);
    expect(n.size).toBe(size);
  });

  it("sets what follows at Arial's advances, a subscript at 75% and 2.25 below", () => {
    const [n, h, two] = placeLabel(
      label([{ text: "N" }, { text: "H" }, { text: "2", sub: true }]),
      size,
    );
    expect(h.x).toBeCloseTo(n.x + advanceEm("N") * size, 12);
    expect(h.y).toBe(n.y);
    expect(two.x).toBeCloseTo(h.x + advanceEm("H") * size, 12);
    expect(two.size).toBeCloseTo(7.5, 12);
    expect(two.y).toBeCloseTo(n.y - 2.25, 12);
  });

  it("puts a two-letter symbol's first letter on the atom, as it does the C of CH3", () => {
    const [cl] = placeLabel(label([{ text: "Cl" }]), size);
    expect(cl.x).toBeCloseTo((-advanceEm("C") * size) / 2, 12);
  });

  it("centres the whole symbol when asked, as between two bonds straight out to the sides", () => {
    const [cl] = placeLabel({ ...label([{ text: "Cl" }]), centreSymbol: true }, size);
    expect(cl.x).toBeCloseTo(-((advanceEm("C") + advanceEm("l")) * size) / 2, 12);
    const L = NOMINAL_BOND_LENGTH;
    const labelFor = (angles: number[]) => {
      const atoms: Atom[] = [
        { id: 0, x: 0, y: 0, el: "Cl" },
        ...angles.map((d, k) => ({
          id: k + 1,
          x: L * Math.cos((d * Math.PI) / 180),
          y: L * Math.sin((d * Math.PI) / 180),
          el: "C",
        })),
      ];
      const bonds: Bond[] = angles.map((_, k) => ({ a1: 0, a2: k + 1, order: 1 }));
      return buildTextLabels(atoms, opts(), bonds)[0];
    };
    expect(labelFor([0, 180]).centreSymbol).toBe(true);
    // a zigzag's bonds are 30 degrees off the horizontal: the C stays on the atom
    expect(labelFor([30, 150]).centreSymbol).toBeUndefined();
    expect(labelFor([150]).centreSymbol).toBeUndefined();
  });

  it("stacks the hydrogens on a line below, the H centred under the symbol", () => {
    const stacked = { ...label([{ text: "C" }, { text: "H" }, { text: "2", sub: true }]), stack: "below" as const };
    const [c, h, two] = placeLabel(stacked, size);
    expect(c.y).toBeCloseTo(-4, 12);
    expect(h.x).toBeCloseTo((-advanceEm("H") * size) / 2, 12);
    expect(h.y).toBeCloseTo(-4 - 8.57, 12);
    expect(two.x).toBeCloseTo(h.x + advanceEm("H") * size, 12);
    expect(two.y).toBeCloseTo(h.y - 2.25, 12);
    const above = placeLabel({ ...stacked, stack: "above" }, size);
    expect(above[1].y).toBeCloseTo(-4 + 8.57, 12);
  });

  it("keeps the symbol on the atom when the hydrogens go first", () => {
    const [h, o] = placeLabel(label([{ text: "H" }, { text: "O" }], 1), size);
    expect(o.x).toBeCloseTo((-advanceEm("O") * size) / 2, 12);
    expect(h.x).toBeCloseTo(o.x - advanceEm("H") * size, 12);
  });

  it("gives a letter's ink as its outline, on the baseline", () => {
    const [hull] = labelHulls(label([{ text: "N" }]), size);
    // the N's ink, as the table has it, set on the baseline at the label's size
    const ink = inkHullEm("N");
    const xs = hull.map((p) => p.x);
    const ys = hull.map((p) => p.y);
    const left = (-advanceEm("N") * size) / 2;
    expect(Math.min(...xs)).toBeCloseTo(left + Math.min(...ink.map((p) => p.x)) * size, 9);
    expect(Math.max(...xs)).toBeCloseTo(left + Math.max(...ink.map((p) => p.x)) * size, 9);
    expect(Math.min(...ys)).toBeCloseTo(-4, 9);
    expect(Math.max(...ys)).toBeCloseTo(-4 + Math.max(...ink.map((p) => p.y)) * size, 9);
  });
});

describe("how far a bond stops short of a label", () => {
  const ZOOM = 40;
  const deg = new Map([
    [0, 1],
    [1, 3],
  ]);
  // an N with three bonds, so it is written without hydrogens, and a bond
  // of the length the style is set for
  const L = NOMINAL_BOND_LENGTH;
  const fromAngle = (deg: number): Atom[] => {
    const a = (deg * Math.PI) / 180;
    return [
      { id: 1, x: L * Math.cos(a), y: L * Math.sin(a), el: "C" },
      { id: 2, x: 0, y: 0, el: "N" },
    ];
  };
  const bond: Bond = { a1: 0, a2: 1, order: 1 };
  const nHulls = (o: LayoutOptions) =>
    labelHulls(
      { x: 0, y: 0, text: "N", fontPx: o.fontPx, runs: [{ text: "N" }] },
      o.fontPx,
    );

  it("stops the margin beyond the furthest the letters reach along the bond, from any side", () => {
    const o = opts();
    for (let angle = 0; angle < 360; angle += 15) {
      const atoms = fromAngle(angle);
      const [line] = buildBondPrimitives(atoms, bond, o, ZOOM, deg).lines;
      const d = { x: atoms[0].x / L, y: atoms[0].y / L };
      let reach = -Infinity;
      for (const hull of nHulls(o)) {
        for (const p of hull) reach = Math.max(reach, p.x * d.x + p.y * d.y);
      }
      expect(Math.hypot(line.x2, line.y2)).toBeCloseTo(reach + o.labelMarginPx!, 9);
    }
  });

  it("stops a bond meeting an N's side at a slant as far out as its corner reaches", () => {
    const o = opts();
    // 30 degrees below the horizontal: the N's bottom corner reaches further
    // along the bond than its side does, and it is what the bond clears
    const [line] = buildBondPrimitives(fromAngle(330), bond, o, ZOOM, deg).lines;
    const n = nHulls(o)[0];
    const right = Math.max(...n.map((p) => p.x));
    const bottom = Math.min(...n.map((p) => p.y));
    const d = { x: Math.cos(-Math.PI / 6), y: Math.sin(-Math.PI / 6) };
    const corner = right * d.x + bottom * d.y;
    expect(Math.hypot(line.x2, line.y2)).toBeCloseTo(corner + o.labelMarginPx!, 9);
    // which reaches further along the bond than the side itself does
    expect(corner).toBeGreaterThan(right * d.x);
  });

  it("stops a line from straight above the margin over the capital's top", () => {
    const o = opts();
    const [line] = buildBondPrimitives(fromAngle(90), bond, o, ZOOM, deg).lines;
    const top = -o.fontPx * 0.4 + Math.max(...inkHullEm("N").map((p) => p.y)) * o.fontPx;
    expect(line.y2).toBeCloseTo(top + o.labelMarginPx!, 9);
  });

  it("keeps a third of the bond between two labels seen, however much of it they would take", () => {
    const o = opts();
    // two wide labels on a short bond: neither may take its full clearance,
    // and together they leave a third of it (BOND_SEEN_LEAST) - nine tenths
    // of it was theirs before (the maintainer, 2026-10-14)
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "Br" },
      { id: 2, x: 0.6, y: 0, el: "Br" },
    ];
    const [line] = buildBondPrimitives(atoms, bond, o, ZOOM).lines;
    expect(line.x2 - line.x1).toBeCloseTo(0.6 * BOND_SEEN_LEAST, 9);
    // (a share set lower than the rule is kept)
    const [kept] = buildBondPrimitives(atoms, bond, opts({ labelShareMax: 0.4 }), ZOOM).lines;
    expect(kept.x2 - kept.x1).toBeCloseTo(0.6 * 0.6, 9);
  });

  it("shows a wedge's width at its broad end however wide the label there", () => {
    const o = opts();
    // a wedge from a carbon to a wide label on a short bond: the label would
    // take nearly all of it; a third is seen, and the broad end as wide as ever
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 0.6, y: 0, el: "Br" },
    ];
    const deg = new Map([
      [0, 3],
      [1, 1],
    ]);
    const { polys } = buildBondPrimitives(atoms, { a1: 0, a2: 1, order: 1, stereo: "up" }, o, ZOOM, deg);
    const xs = polys[0].points.map((p) => p.x);
    const ys = polys[0].points.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(0.6 * BOND_SEEN_LEAST - 1e-9);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo((o.units ?? "px") === "world" ? o.wedgeWidthPx : o.wedgeWidthPx / ZOOM, 6);
  });

  it("follows the letters: closer to an O's round side than to an N's corner", () => {
    const o = opts();
    const at = (el: string, angle: number) => {
      const atoms = fromAngle(angle);
      atoms[1].el = el;
      const [line] = buildBondPrimitives(atoms, bond, o, ZOOM, deg).lines;
      return Math.hypot(line.x2, line.y2);
    };
    // an O is round and an N square: side on the two are nearly as wide,
    // but at 45 degrees the O's curve leaves more room
    expect(at("O", 45)).toBeLessThan(at("N", 45));
  });

  it("stops a bond for the letters in its path, not an H set below beside it", () => {
    const o = opts();
    // an N+ with three bonds and an H, which goes below (the bonds rise
    // furthest): the two bonds leaving it downward at a slant pass it clear
    const v = (deg: number) => ({ x: L * Math.cos((deg * Math.PI) / 180), y: L * Math.sin((deg * Math.PI) / 180) });
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "N", charge: 1 },
      { id: 2, ...v(90), el: "C" },
      { id: 3, ...v(210), el: "C" },
      { id: 4, ...v(330), el: "C" },
    ];
    const bonds: Bond[] = [1, 2, 3].map((k) => ({ a1: 0, a2: k, order: 1 }));
    expect(buildTextLabels(atoms, o, bonds)[0].stack).toBe("below");
    // where the bond at 330 degrees starts, with the H and without it
    const start = (over: Partial<LayoutOptions>) => {
      const { lines } = buildAllPrimitives(atoms, bonds, opts(over), ZOOM);
      const line = lines.find((l) => {
        const mid = Math.atan2((l.y1 + l.y2) / 2, (l.x1 + l.x2) / 2);
        return Math.abs(mid + Math.PI / 6) < 0.05;
      })!;
      return Math.min(Math.hypot(line.x1, line.y1), Math.hypot(line.x2, line.y2));
    };
    expect(start({})).toBeCloseTo(start({ showImplicitHydrogens: false }), 9);
  });
});

describe("a wedge with a bond carrying straight on", () => {
  const ZOOM = 40;
  // the wide end at atom 1, with one bond carrying on in line with the wedge
  // and another leaving at an angle
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 0, el: "C" },
    { id: 2, x: 1.5, y: 0, el: "C" },
    { id: 3, x: 3, y: 0, el: "C" },
    { id: 4, x: 2.2, y: -1.3, el: "C" },
  ];
  const bonds: Bond[] = [
    { a1: 0, a2: 1, order: 1, stereo: "up", stereoOrient: "reverse" },
    { a1: 1, a2: 2, order: 1, stereo: "none" },
    { a1: 1, a2: 3, order: 1, stereo: "none" },
  ];

  it("squares the end across the bond that carries on", () => {
    const o = opts({ joinStyle: "sharp" });
    const { polys } = buildAllPrimitives(atoms, bonds, o, ZOOM);
    const wedge = polys.reduce((big, p) =>
      polyArea(p.points) > polyArea(big.points) ? p : big,
    );
    const end = wedge.points.filter((p) => p.x > 0.75);
    // three points at the wide end: a corner either side and the turn between
    expect(end.length).toBe(3);
    // and the end reaches past the atom, so the bond comes out of it
    expect(Math.max(...end.map((p) => p.x))).toBeGreaterThan(1.5);
  });
});

describe("a wavy bond", () => {
  const o = opts();
  const L = NOMINAL_BOND_LENGTH;
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 0, el: "C" },
    { id: 2, x: L, y: 0, el: "C" },
  ];
  const wavy: Bond = { a1: 0, a2: 1, order: 1, stereo: "wavy" };
  const points = (lines: LineSeg[]) => [
    { x: lines[0].x1, y: lines[0].y1 },
    ...lines.map((l) => ({ x: l.x2, y: l.y2 })),
  ];
  const half = () => o.wavyPeriodPx / 2;

  it("is half circles either side of the line, the first to the right going out", () => {
    // the stereocentre is the atom with more bonds: here the second
    const deg = new Map([
      [0, 1],
      [1, 3],
    ]);
    const { lines } = buildBondPrimitives(atoms, wavy, o, 40, deg);
    const pts = points(lines).map((p) => ({ u: L - p.x, v: p.y }));
    // it starts on the line at the stereocentre
    expect(pts[0].u).toBeCloseTo(0, 9);
    expect(pts[0].v).toBeCloseTo(0, 9);
    // going out along -x, the right is +y
    const firstTurn = pts.filter((p) => p.u > 0 && p.u < half());
    expect(Math.min(...firstTurn.map((p) => p.v))).toBeGreaterThan(-1e-9);
    // every point lies on the half circle of its turn, alternately either side
    expect(o.wavyAmpPx).toBeCloseTo(half() / 2, 9);
    for (const p of pts) {
      const k = Math.min(Math.floor(p.u / half() + 1e-9), 1e9);
      const centre = (k + 0.5) * half();
      const r = Math.hypot(p.u - centre, p.v);
      const onPrevious = Math.hypot(p.u - (k - 0.5) * half(), p.v);
      expect(Math.min(Math.abs(r - half() / 2), Math.abs(onPrevious - half() / 2))).toBeLessThan(1e-9);
      if (Math.abs(p.v) > 1e-6) expect(Math.sign(p.v)).toBe(k % 2 === 0 ? 1 : -1);
    }
  });

  it("is as many quarter turns as fit between the atoms", () => {
    const { lines } = buildBondPrimitives(atoms, wavy, o, 40);
    const pts = points(lines);
    const quarter = half() / 2;
    const reach = Math.floor(L / quarter + 1e-9) * quarter;
    const end = pts[pts.length - 1];
    expect(end.x).toBeCloseTo(reach, 9);
    // an odd number of quarters ends at the top of a turn, off the line
    const quarters = Math.round(reach / quarter);
    if (quarters % 2 === 1) expect(Math.abs(end.y)).toBeCloseTo(o.wavyAmpPx, 9);
    else expect(end.y).toBeCloseTo(0, 9);
  });

  it("leaves its far end free, to be finished like any other", () => {
    const round = opts({ joinStyle: "round" });
    const { lines, ends } = buildBondPrimitives(atoms, wavy, round, 40);
    const last = lines[lines.length - 1];
    expect(ends).toContainEqual({ x: last.x2, y: last.y2 });
  });
});

describe("bold, hashed, dashed and dative bonds", () => {
  const L = NOMINAL_BOND_LENGTH;
  const ZOOM = 40;
  const pair: Atom[] = [
    { id: 1, x: 0, y: 0, el: "C" },
    { id: 2, x: L, y: 0, el: "C" },
  ];
  const deg = new Map([
    [0, 3],
    [1, 1],
  ]);
  const one = (extra: Partial<Bond>): Bond => ({ a1: 0, a2: 1, order: 1, ...extra });

  it("draws stereo first, then a single bond's display, then a dative arrow", () => {
    expect(bondKind(one({ stereo: "up", display: "bold" }))).toBe("wedge");
    expect(bondKind(one({ display: "bold", dative: true }))).toBe("bold");
    expect(bondKind(one({ dative: true }))).toBe("dative");
    expect(bondKind({ ...one({ display: "dashed" }), order: 2 })).toBe("lines");
    expect(bondKind(one({ display: "plain" }))).toBe("lines");
  });

  it("draws a ring's bond toward the viewer as a wedge, narrow where stereoOrient says, saying no configuration", () => {
    expect(bondKind(one({ display: "wedge" }))).toBe("wedge");
    const { lines, polys } = buildBondPrimitives(pair, one({ display: "wedge" }), opts(), ZOOM, deg);
    expect(lines).toHaveLength(0);
    expect(polys).toHaveLength(1);
    const widthAt = (x: number) => {
      const near = polys[0].points.filter((p) => Math.abs(p.x - x) < 1e-6).map((p) => p.y);
      return near.length ? Math.max(...near) - Math.min(...near) : 0;
    };
    const narrowAtA1 = wedgeNarrowAtom(one({ display: "wedge" }), deg) === 0;
    expect(widthAt(narrowAtA1 ? 0 : L) < widthAt(narrowAtA1 ? L : 0)).toBe(true);
  });

  it("keeps a double bond's second line where its own is bold or a wedge, in a ring in perspective", () => {
    // a hexagon, its first bond a double one: the second line inside it
    const hex: Atom[] = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      x: L * Math.cos((Math.PI / 3) * i),
      y: L * Math.sin((Math.PI / 3) * i),
      el: "C",
    }));
    for (const display of ["bold", "wedge"] as const) {
      const ring: Bond[] = hex.map((_, i) => ({ a1: i, a2: (i + 1) % 6, order: i === 0 ? 2 : 1, ...(i === 0 ? { display } : {}) }));
      const plain = buildAllPrimitives(hex, ring.map((b) => ({ ...b, display: undefined })), opts(), ZOOM);
      const shown = buildAllPrimitives(hex, ring, opts(), ZOOM);
      // its own line a shape (bigger than any cap at a join), its second line a line as before
      expect(shown.lines.length, display).toBe(plain.lines.length - 1);
      const biggest = (ps: { points: Vec2[] }[]) => Math.max(0, ...ps.map((p) => polyArea(p.points)));
      expect(biggest(shown.polys), display).toBeGreaterThan(biggest(plain.polys) * 4);
    }
  });

  it("draws a bold bond as a bar the bold width across, square where nothing carries on", () => {
    const o = opts();
    const { lines, polys } = buildBondPrimitives(pair, one({ display: "bold" }), o, ZOOM, deg);
    expect(lines).toHaveLength(0);
    expect(polys).toHaveLength(1);
    const ys = polys[0].points.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(o.boldWidthPx!, 9);
    const xs = polys[0].points.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(0, 9);
    expect(Math.max(...xs)).toBeCloseTo(L, 9);
  });

  it("cuts a bold bond's end in a V between two bonds carrying on from its atom", () => {
    const o = opts();
    // the bar runs up from atom 0, between bonds up to the left and right
    const a = (deg: number) => (deg * Math.PI) / 180;
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 0, y: L, el: "C" },
      { id: 3, x: L * Math.cos(a(150)), y: L * Math.sin(a(150)), el: "C" },
      { id: 4, x: L * Math.cos(a(30)), y: L * Math.sin(a(30)), el: "C" },
    ];
    const bonds: Bond[] = [
      one({ display: "bold" }),
      { a1: 0, a2: 2, order: 1 },
      { a1: 0, a2: 3, order: 1 },
    ];
    const { polys } = buildAllPrimitives(atoms, bonds, o, ZOOM);
    const bar = polys.reduce((big, p) =>
      polyArea(p.points) > polyArea(big.points) ? p : big,
    );
    // the V's point is where the two bonds' inner edges cross, just above
    // the atom, and the bonds' own lines fill in below it
    const low = bar.points.reduce((m, p) => (p.y < m.y ? p : m));
    expect(low.x).toBeCloseTo(0, 9);
    expect(low.y).toBeCloseTo(o.lineWidthPx / 2 / Math.cos(Math.PI / 6), 9);
    // and its corners sit on the near edges of the two bonds
    const corners = bar.points.filter((p) => p.y < L / 2 && Math.abs(p.x) > 1e-6);
    expect(corners).toHaveLength(2);
    for (const p of corners) {
      const d = { x: Math.cos(a(p.x < 0 ? 150 : 30)), y: Math.sin(a(p.x < 0 ? 150 : 30)) };
      const off = Math.abs(p.x * d.y - p.y * d.x);
      expect(off).toBeCloseTo(o.lineWidthPx / 2, 9);
    }
  });

  it("rounds a bold bond's free end into a half circle when ends are round", () => {
    const o = opts({ joinStyle: "round" });
    const { polys } = buildBondPrimitives(pair, one({ display: "bold" }), o, ZOOM, deg);
    const far = polys[0].points.filter((p) => p.x > L - o.boldWidthPx!);
    for (const p of far) {
      expect(Math.hypot(p.x - (L - o.boldWidthPx! / 2), p.y)).toBeLessThanOrEqual(
        o.boldWidthPx! / 2 + 1e-9,
      );
    }
  });

  it("sets out a hashed bond's hashes as a hashed wedge's, all the bold width long", () => {
    const o = opts();
    const { lines, polys } = buildBondPrimitives(pair, one({ display: "hashed" }), o, ZOOM, deg);
    expect(lines).toHaveLength(0);
    const hashes = hashesOf(polys);
    const s = o.hashSpacingPx;
    expect(hashes[0].near).toBeCloseTo(s, 9);
    expect(hashes[hashes.length - 1].far).toBeCloseTo(L, 9);
    expect(hashes).toHaveLength(1 + Math.floor((L - s - o.lineWidthPx) / s));
    for (const h of hashes) {
      expect(h.nearWidth).toBeCloseTo(o.boldWidthPx!, 9);
      expect(h.farWidth).toBeCloseTo(o.boldWidthPx!, 9);
    }
  });

  it("starts a hashed bond from the atom with more bonds", () => {
    const o = opts();
    const flipped = new Map([
      [0, 1],
      [1, 3],
    ]);
    const hashes = hashesOf(
      buildBondPrimitives(pair, one({ display: "hashed" }), o, ZOOM, flipped).polys,
    );
    expect(hashes[0].near).toBeCloseTo(0, 9);
    expect(hashes[hashes.length - 1].far).toBeCloseTo(L - o.hashSpacingPx, 9);
  });

  it("dashes a dashed bond from end to end, the gaps even and never short", () => {
    const o = opts();
    const { lines } = buildBondPrimitives(pair, one({ display: "dashed" }), o, ZOOM, deg);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines[0].x1).toBeCloseTo(0, 9);
    expect(lines[lines.length - 1].x2).toBeCloseTo(L, 9);
    for (const l of lines) expect(l.x2 - l.x1).toBeCloseTo(o.dashLengthPx!, 9);
    const gaps = lines.slice(1).map((l, i) => l.x1 - lines[i].x2);
    for (const g of gaps) {
      expect(g).toBeCloseTo(gaps[0], 9);
      expect(g).toBeGreaterThanOrEqual(o.dashGapPx! - 1e-9);
    }
  });

  it("draws a dative bond as an arrow from the first atom to the second", () => {
    const o = opts();
    const { lines, polys } = buildBondPrimitives(pair, one({ dative: true }), o, ZOOM, deg);
    expect(lines).toHaveLength(1);
    expect(lines[0].x1).toBeCloseTo(0, 9);
    const [head] = polys;
    expect(head.points).toHaveLength(3);
    // its point on the acceptor, its base a head's length back
    expect(Math.max(...head.points.map((p) => p.x))).toBeCloseTo(L, 9);
    expect(Math.min(...head.points.map((p) => p.x))).toBeCloseTo(L - o.dativeHeadLengthPx!, 9);
    const ys = head.points.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(o.dativeHeadWidthPx!, 9);
  });

  it("takes no hydrogens from either end of a dative bond", () => {
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "N" },
      { id: 2, x: L, y: 0, el: "B" },
    ];
    const labels = buildTextLabels(atoms, opts(), [one({ dative: true })]);
    expect(labels.map((t) => t.text).sort()).toEqual(["BH3", "H3N"]);
  });

  it("puts no cap on a bold or hashed bond's atom, nor on a dative arrow's point", () => {
    const o = opts({ joinStyle: "round" });
    for (const extra of [{ display: "bold" as const }, { display: "hashed" as const }, { dative: true }]) {
      const { fills } = buildAllPrimitives(pair, [one(extra)], o, ZOOM);
      expect(fills.some((f) => Math.hypot(f.c.x - L, f.c.y) < 1e-9)).toBe(false);
    }
  });
});

describe("a single bond on the end of a double bond", () => {
  const L = NOMINAL_BOND_LENGTH;
  // A - B = C, C straight out from B along +x, A at `deg` round from it
  const drawn = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    const atoms: Atom[] = [
      { id: 1, x: L * Math.cos(a), y: L * Math.sin(a), el: "C" },
      { id: 2, x: 0, y: 0, el: "C" },
      { id: 3, x: L, y: 0, el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 1 },
      { a1: 1, a2: 2, order: 2 },
    ];
    return { atoms, ...buildAllPrimitives(atoms, bonds, opts(), 40) };
  };
  // the double bond's lines: the ones lying along x, off to the right of B
  const doubleLines = (lines: LineSeg[]) =>
    lines.filter((l) => Math.abs(l.y1 - l.y2) < 1e-9 && Math.max(l.x1, l.x2) > L / 2);

  it("keeps the second line on the single bond's side, however far round it leans", () => {
    for (const deg of [90, 120, 135, 150, 165, 175, 185, 195, 210, 225, 240, 270]) {
      const side = Math.sign(Math.sin((deg * Math.PI) / 180));
      const ys = doubleLines(drawn(deg).lines).map((l) => l.y1);
      expect(ys).toHaveLength(2);
      // one line on the bond's own axis, the other on the single bond's side
      expect(ys.some((y) => Math.abs(y) < 1e-9)).toBe(true);
      expect(Math.sign(ys.find((y) => Math.abs(y) > 1e-9)!)).toBe(side);
    }
  });

  it("centres the double bond when the single bond carries straight on, and stretches nothing", () => {
    for (const deg of [179, 180, 181]) {
      const { lines } = drawn(deg);
      const ys = doubleLines(lines).map((l) => l.y1);
      expect(ys[0]).toBeCloseTo(-ys[1], 9);
      // every line stays within the three atoms' reach
      for (const l of lines) {
        for (const x of [l.x1, l.x2]) {
          expect(x).toBeGreaterThanOrEqual(-L - 1e-6);
          expect(x).toBeLessThanOrEqual(L + 1e-6);
        }
      }
    }
  });
});

describe("a ring's bonds in perspective", () => {
  it("meet square where a bold edge and a wedge broad there do, their outer corner filled to a point", () => {
    const L = NOMINAL_BOND_LENGTH;
    // a front edge 0-1, bold, and a wedge 2-0 toward it, broad at 0
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: L, y: 0, el: "C" },
      { id: 3, x: -0.5 * L, y: 0.8 * L, el: "C" },
    ];
    const deg = new Map([[0, 2], [1, 1], [2, 1]]);
    const wedge: Bond = { a1: 2, a2: 0, order: 1, display: "wedge" };
    // (narrow at 2: as stereoOrient puts it)
    const narrow = wedgeNarrowAtom({ ...wedge, stereoOrient: "principle" }, deg);
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 1, display: "bold" },
      narrow === 2 ? wedge : { ...wedge, stereoOrient: "reverse" },
    ];
    const { polys } = buildAllPrimitives(atoms, bonds, opts(), 40);
    // the corner: four points, the first the atom itself, the third out past both shapes
    const corner = polys.find((p) => p.points.length === 4 && Math.hypot(p.points[0].x, p.points[0].y) < 1e-9);
    expect(corner).toBeDefined();
    const [, , tip] = corner!.points;
    expect(tip.y).toBeLessThan(0);
    expect(tip.x).toBeLessThan(0);
  });

  // two bold edges meeting at atom 0, the second at `deg` degrees from the first
  const twoEdges = (deg: number) => {
    const L = NOMINAL_BOND_LENGTH;
    const t = (deg * Math.PI) / 180;
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: L, y: 0, el: "C" },
      { id: 3, x: L * Math.cos(t), y: L * Math.sin(t), el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 1, display: "bold" },
      { a1: 0, a2: 2, order: 1, display: "bold" },
    ];
    return buildAllPrimitives(atoms, bonds, opts({ joinStyle: "round" }), 40).polys;
  };

  it("keeps a bold edge's end square where another meets it, round ends or not", () => {
    const polys = twoEdges(100);
    // the first edge's outer corner at the atom, below it - away from the
    // second - as the corner filled between them has it
    const corner = polys.find((p) => p.points.length === 4 && Math.hypot(p.points[0].x, p.points[0].y) < 1e-9)!;
    const outer = corner.points.find((q) => Math.abs(q.x) < 1e-9 && q.y < 0)!;
    // and the first edge's bar has it too, not rounded off
    const bar = polys.find((p) => p !== corner && p.points.some((q) => q.x > 0.9 * NOMINAL_BOND_LENGTH))!;
    expect(bar.points.some((q) => Math.hypot(q.x - outer.x, q.y - outer.y) < 1e-9)).toBe(true);
  });

  it("cuts a corner sharper than 60 degrees across, not out to a far point", () => {
    const corner = (deg: number) => twoEdges(deg).find((p) => Math.hypot(p.points[0].x, p.points[0].y) < 1e-9 && p.points.length <= 4)!;
    expect(corner(100).points).toHaveLength(4);
    expect(corner(45).points).toHaveLength(3);
  });
});

describe("a carbon between two double bonds", () => {
  it("has its symbol drawn, and both double bonds their lines either side of the line they make", () => {
    const L = NOMINAL_BOND_LENGTH;
    const ZOOM = 40;
    // R-N=C=N-R, straight through the C
    const atoms: Atom[] = [
      { id: 1, x: -2 * L, y: 0.6 * L, el: "C" },
      { id: 2, x: -L, y: 0, el: "N" },
      { id: 3, x: 0, y: 0, el: "C" },
      { id: 4, x: L, y: 0, el: "N" },
      { id: 5, x: 2 * L, y: -0.6 * L, el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 1 },
      { a1: 1, a2: 2, order: 2 },
      { a1: 2, a2: 3, order: 2 },
      { a1: 3, a2: 4, order: 1 },
    ];
    expect(cumulatedShown(atoms, bonds).map((a) => !!a.shown)).toEqual([false, false, true, false, false]);
    const layout = layoutMolecule(atoms, bonds, opts(), ZOOM);
    expect(layout.texts.some((t) => t.text === "C")).toBe(true);
    // (no second line off to one side: each pair straddles the axis, y = 0)
    const level = layout.lines.filter((l) => Math.abs(l.y1 - l.y2) < 1e-9 && Math.abs(l.y1) > 1e-9);
    expect(level.some((l) => l.y1 > 0) && level.some((l) => l.y1 < 0)).toBe(true);
  });
});

describe("where bonds crowd each other", () => {
  it("runs a triple bond's outer lines its whole length, as ACS 1996 does", () => {
    const o = opts();
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.5, y: 0, el: "C" },
      { id: 3, x: 2.3, y: 1.3, el: "C" }, // something else at the far end
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 3, stereo: "none" },
      { a1: 1, a2: 2, order: 1, stereo: "none" },
    ];
    const { lines } = buildAllPrimitives(atoms, bonds, o, 40);
    const triple = lines.filter((l) => l.x1 < 1.6 && l.x2 <= 1.5 + 1e-9);
    const middle = triple.find((l) => Math.abs(l.y1) < 1e-9)!;
    const outer = triple.filter((l) => Math.abs(l.y1) > 1e-9);
    expect(outer).toHaveLength(2);
    // square to the atom at both ends, the one another bond joins as well
    for (const l of outer) {
      expect(l.x1).toBeCloseTo(middle.x1, 9);
      expect(l.x2).toBeCloseTo(middle.x2, 9);
    }
  });

  it("keeps a wedge's join filled where only wedges meet", () => {
    const o = opts({ joinStyle: "round" });
    // a stereocentre carrying nothing but wedges
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.5, y: 0, el: "C" },
      { id: 3, x: -0.75, y: 1.3, el: "C" },
      { id: 4, x: -0.75, y: -1.3, el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 1, stereo: "up" },
      { a1: 0, a2: 2, order: 1, stereo: "up" },
      { a1: 0, a2: 3, order: 1, stereo: "down" },
    ];
    const { fills } = buildAllPrimitives(atoms, bonds, o, 40);
    // the thin ends are each a bond wide and do not fill the join on their own
    expect(fills.some((f) => Math.hypot(f.c.x, f.c.y) < 1e-9)).toBe(true);
  });
});

describe("double bonds, as ACS 1996 draws them", () => {
  const o = () => opts({ joinStyle: "sharp" });
  const off = () => o().doubleOffsetPx; // world units: the options are in world
  const hexagon = (): Atom[] =>
    [0, 1, 2, 3, 4, 5].map((k) => ({
      id: k + 1,
      x: 1.5 * Math.cos((Math.PI / 3) * k),
      y: 1.5 * Math.sin((Math.PI / 3) * k),
      el: "C",
    }));
  const ringBonds = (): Bond[] =>
    [0, 1, 2, 3, 4, 5].map((k) => ({
      a1: k,
      a2: (k + 1) % 6,
      order: k === 0 ? 2 : 1,
    }));
  const along = (l: LineSeg, p: Vec2, q: Vec2) => {
    // where a line's ends fall along p->q, as distances from p
    const d = { x: (q.x - p.x) / Math.hypot(q.x - p.x, q.y - p.y), y: (q.y - p.y) / Math.hypot(q.x - p.x, q.y - p.y) };
    const t = (x: number, y: number) => (x - p.x) * d.x + (y - p.y) * d.y;
    return [t(l.x1, l.y1), t(l.x2, l.y2)].sort((a, b) => a - b);
  };

  it("stops a ring's inner line on the bisectors of its corners", () => {
    const atoms = hexagon();
    const { lines } = buildAllPrimitives(atoms, ringBonds(), o(), 40);
    const p = atoms[0];
    const q = atoms[1];
    const inner = lines.find((l) => {
      const mid = { x: (l.x1 + l.x2) / 2, y: (l.y1 + l.y2) / 2 };
      return Math.hypot(mid.x, mid.y) < 1.2 && Math.hypot(mid.x, mid.y) > 0.5;
    })!;
    const [t1, t2] = along(inner, p, q);
    const back = off() / Math.tan(Math.PI / 3); // half of 120 degrees
    expect(t1).toBeCloseTo(back, 9);
    expect(t2).toBeCloseTo(1.5 - back, 9);
  });

  it("shortens a chain's second line only at the end inside the zigzag", () => {
    // 0 -- 1 == 2 -- 3, zigzag at exactly 120 degrees
    const w = 1.5 * Math.cos(Math.PI / 6);
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: w, y: 0.75, el: "C" },
      { id: 3, x: 2 * w, y: 0, el: "C" },
      { id: 4, x: 3 * w, y: 0.75, el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 1 },
      // "left" of 1->2 is the side 3 is on
      { a1: 1, a2: 2, order: 2, doubleMode: "left" },
      { a1: 2, a2: 3, order: 1 },
    ];
    const { lines } = buildAllPrimitives(atoms, bonds, o(), 40);
    const p = atoms[1];
    const q = atoms[2];
    const second = lines.find(
      (l) => Math.abs((l.y1 + l.y2) / 2 - 0.375) > 0.05 && l.x1 > 1 && l.x2 < 2.7,
    )!;
    const [t1, t2] = along(second, p, q);
    const L = 1.5;
    // outside the corner at 1: right up to the atom
    expect(t1).toBeCloseTo(0, 9);
    // inside the corner at 2 (120 degrees): stopped on its bisector
    expect(t2).toBeCloseTo(L - off() / Math.tan(Math.PI / 3), 6);
  });

  it("never shortens double bonds that carry on in a straight line", () => {
    // 0 == 1 == 2 in a line, each placement in turn
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.5, y: 0, el: "C" },
      { id: 3, x: 3, y: 0, el: "C" },
    ];
    for (const mode of ["left", "right", "center"] as const) {
      const bonds: Bond[] = [
        { a1: 0, a2: 1, order: 2, doubleMode: mode },
        { a1: 1, a2: 2, order: 2, doubleMode: mode },
      ];
      const { lines } = buildAllPrimitives(atoms, bonds, o(), 40);
      // every line off the axis runs from one atom's end to the other's:
      // together they cover 0..3 on each side without a gap
      const off = lines.filter((l) => Math.abs(l.y1) > 1e-9);
      for (const y of new Set(off.map((l) => l.y1.toFixed(9)))) {
        const row = off
          .filter((l) => l.y1.toFixed(9) === y)
          .map((l) => [Math.min(l.x1, l.x2), Math.max(l.x1, l.x2)])
          .sort((p, q) => p[0] - q[0]);
        expect(row[0][0]).toBeCloseTo(0, 9);
        for (let i = 1; i < row.length; i++) {
          expect(row[i][0]).toBeCloseTo(row[i - 1][1], 9);
        }
        expect(row[row.length - 1][1]).toBeCloseTo(3, 9);
      }
    }
  });

  it("runs a centred double bond's lines on to the plain bonds either side", () => {
    // 1 == 2, centred, with a plain bond leaving 2 on each side
    const atoms: Atom[] = [
      { id: 1, x: -1.5, y: 0, el: "C" },
      { id: 2, x: 0, y: 0, el: "C" },
      { id: 3, x: 0.75, y: 1.3, el: "C" },
      { id: 4, x: 0.75, y: -1.3, el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 2, doubleMode: "center" },
      { a1: 1, a2: 2, order: 1 },
      { a1: 1, a2: 3, order: 1 },
    ];
    const { lines, fills, polys } = buildAllPrimitives(atoms, bonds, o(), 40);
    const h = off() / 2;
    for (const [far, side] of [[2, 1], [3, -1]] as const) {
      const u = { x: atoms[far].x / 1.5, y: atoms[far].y / 1.5 };
      // where the line on this side meets the plain bond's own line
      const k = h / Math.abs(u.y);
      const meet = { x: u.x * k, y: side * h };
      const dbl = lines.find((l) => Math.abs(l.y1 - side * h) < 1e-9 && Math.abs(l.y2 - side * h) < 1e-9)!;
      expect(Math.max(dbl.x1, dbl.x2)).toBeCloseTo(meet.x, 9);
      // the plain bond still reaches the atom itself
      const plain = lines.find((l) => Math.hypot(l.x2 - atoms[far].x, l.y2 - atoms[far].y) < 1e-9)!;
      expect(plain.x1).toBeCloseTo(0, 9);
      expect(plain.y1).toBeCloseTo(0, 9);
    }
    // nothing round anywhere with square ends; the corners are mitred
    expect(fills).toHaveLength(0);
    expect(polys.length).toBeGreaterThan(0);
  });
});

describe("round or square, never some of each", () => {
  // a chain carrying one of everything: a double, a triple, a hashed wedge,
  // a wavy bond, and a label at the end of a plain bond
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 0, el: "C" },
    { id: 2, x: 1.3, y: 0.75, el: "C" },
    { id: 3, x: 2.6, y: 0, el: "C" },
    { id: 4, x: 3.9, y: 0.75, el: "C" },
    { id: 5, x: 5.2, y: 0, el: "C" },
    { id: 6, x: 2.6, y: -1.5, el: "C" },
    { id: 7, x: 0, y: -1.5, el: "C" },
    { id: 8, x: 1.3, y: 2.25, el: "O" },
  ];
  const bonds: Bond[] = [
    { a1: 0, a2: 1, order: 2, doubleMode: "right" },
    { a1: 1, a2: 2, order: 1 },
    { a1: 2, a2: 3, order: 3 },
    { a1: 3, a2: 4, order: 1 },
    { a1: 2, a2: 5, order: 1, stereo: "down" },
    { a1: 0, a2: 6, order: 1, stereo: "wavy" },
    { a1: 1, a2: 7, order: 1 },
  ];
  const lineEnds = (lines: { x1: number; y1: number; x2: number; y2: number }[]) =>
    lines.flatMap((l) => [
      { x: l.x1, y: l.y1 },
      { x: l.x2, y: l.y2 },
    ]);
  const near = (fills: { c: Vec2 }[], p: Vec2) =>
    fills.some((f) => Math.hypot(f.c.x - p.x, f.c.y - p.y) < 1e-9);

  it("rounds every line's ends when ends are round", () => {
    const o = opts({ joinStyle: "round" });
    const { lines, fills } = buildAllPrimitives(atoms, bonds, o, 40);
    // every end of every line has a cap over it - second lines, the triple's
    // outer ones, each hash, each piece of the wave, and the line stopping
    // short of the O - except where it meets an atom that is capped anyway
    const atomsAt = atoms.map((a) => ({ x: a.x, y: a.y }));
    for (const e of lineEnds(lines)) {
      const atAtom = atomsAt.some((p) => Math.hypot(p.x - e.x, p.y - e.y) < 1e-9);
      if (!atAtom) expect(near(fills, e)).toBe(true);
    }
  });

  it("puts nothing round in the drawing when ends are square", () => {
    const o = opts({ joinStyle: "sharp" });
    const { fills, polys } = buildAllPrimitives(atoms, bonds, o, 40);
    expect(fills).toHaveLength(0);
    // the corners along the wave are mitred instead: more polygons than the
    // atoms' own joins account for
    const noWave = buildAllPrimitives(
      atoms,
      bonds.map((b) => (b.stereo === "wavy" ? { ...b, stereo: "none" as const } : b)),
      o,
      40,
    ).polys;
    expect(polys.length).toBeGreaterThan(noWave.length);
  });
});

describe("angles and lines that reach an atom", () => {
  it("follows a bond at 150 degrees to the wedge", () => {
    const o = opts({ joinStyle: "sharp" });
    // wide end at atom 1, with a bond leaving at 150 degrees to the wedge
    const a = (150 * Math.PI) / 180;
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.5, y: 0, el: "C" },
      { id: 3, x: 1.5 + 1.5 * Math.cos(a), y: 1.5 * Math.sin(a), el: "C" },
      { id: 4, x: 1.5, y: -1.5, el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 1, stereo: "up", stereoOrient: "reverse" },
      { a1: 1, a2: 2, order: 1, stereo: "none" },
      { a1: 1, a2: 3, order: 1, stereo: "none" },
    ];
    const { polys } = buildAllPrimitives(atoms, bonds, o, 40);
    const wedge = polys.reduce((big, p) =>
      polyArea(p.points) > polyArea(big.points) ? p : big,
    );
    const end = wedge.points.filter((p) => p.x > 0.75);
    // cut, not left square: the two corners are at different places along it
    expect(Math.abs(end[0].x - end[end.length - 1].x)).toBeGreaterThan(0.05);
  });

  it("leaves no cap where two centred double bonds meet", () => {
    const o = opts();
    // a diene drawn with both lines either side of the bond itself
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.3, y: 0.75, el: "C" },
      { id: 3, x: 2.6, y: 0, el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 2, stereo: "none", doubleMode: "center" },
      { a1: 1, a2: 2, order: 2, stereo: "none", doubleMode: "center" },
    ];
    const { fills } = buildAllPrimitives(atoms, bonds, o, 40);
    // nothing of either bond reaches the atom between them
    expect(
      fills.some((f) => Math.hypot(f.c.x - 1.3, f.c.y - 0.75) < 1e-9),
    ).toBe(false);
  });
});

describe("double bonds in a row", () => {
  it("meets its neighbour's line at the atom they share", () => {
    const o = opts();
    // two double bonds sharing atom 1
    const atoms: Atom[] = [
      { id: 1, x: 0, y: 0, el: "C" },
      { id: 2, x: 1.5, y: 0, el: "C" },
      { id: 3, x: 2.3, y: 1.3, el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 2, stereo: "none" },
      { a1: 1, a2: 2, order: 2, stereo: "none" },
    ];
    const { lines } = buildAllPrimitives(atoms, bonds, o, 40);
    // the ends of the lines beside each bond, near the atom they share
    const at = { x: 1.5, y: 0 };
    const ends: { x: number; y: number; d: number }[] = [];
    for (const l of lines) {
      for (const p of [
        { x: l.x1, y: l.y1 },
        { x: l.x2, y: l.y2 },
      ]) {
        const d = Math.hypot(p.x - at.x, p.y - at.y);
        if (d > 1e-9 && d < 0.6) ends.push({ ...p, d });
      }
    }
    ends.sort((a, b) => a.d - b.d);
    expect(ends.length).toBeGreaterThanOrEqual(2);
    // they meet, rather than each stopping short on its own
    const gap = Math.hypot(ends[0].x - ends[1].x, ends[0].y - ends[1].y);
    expect(gap).toBeLessThan(o.lineWidthPx);
  });
});

describe("a wedge's wide end, at every angle a bond can leave it", () => {
  const ZOOM = 40;
  // The wide end sits at atom 1 - atom 0 carries three bonds, so it is the
  // narrow end - and one bond carries on from it at `deg` to the wedge.
  const bend = (deg: number) => {
    const L = 1.8;
    const a = (deg * Math.PI) / 180;
    const atoms: Atom[] = [
      { id: 0, x: 0, y: 0, el: "C" },
      { id: 1, x: L, y: 0, el: "C" },
      { id: 2, x: L + L * Math.cos(Math.PI - a), y: L * Math.sin(Math.PI - a), el: "C" },
      { id: 3, x: -L * 0.5, y: L * 0.87, el: "C" },
      { id: 4, x: -L * 0.5, y: -L * 0.87, el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 1, stereo: "up" },
      { a1: 1, a2: 2, order: 1, stereo: "none" },
      { a1: 0, a2: 3, order: 1, stereo: "none" },
      { a1: 0, a2: 4, order: 1, stereo: "none" },
    ];
    return { atoms, bonds };
  };
  const wedgeOf = (deg: number) => {
    const { atoms, bonds } = bend(deg);
    const { polys } = buildAllPrimitives(atoms, bonds, opts({ joinStyle: "sharp" }), ZOOM);
    return polys.reduce((big, p) => (polyArea(p.points) > polyArea(big.points) ? p : big));
  };
  const inside = (pts: Vec2[], q: Vec2) => {
    let hit = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i];
      const b = pts[j];
      if (
        a.y > q.y !== b.y > q.y &&
        q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x
      ) {
        hit = !hit;
      }
    }
    return hit;
  };

  it("always covers the atom, so the bonds there are never cut adrift", () => {
    // 145 degrees used to cut along the bond on one side only, which slewed
    // the end across the wedge and left the atom outside it
    for (let deg = 90; deg <= 180; deg += 5) {
      expect([deg, inside(wedgeOf(deg).points, { x: 1.8, y: 0 })]).toEqual([deg, true]);
    }
  });

  it("follows the bond while the angle allows, and squares off past that", () => {
    // a cut along the bond leans the end over; a square one is across the axis
    const lean = (deg: number) => {
      const pts = wedgeOf(deg).points.filter((p) => p.x > 0.9);
      const dy = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
      const dx = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
      return dx / dy;
    };
    expect(lean(120)).toBeGreaterThan(0.4);
    expect(lean(150)).toBeGreaterThan(0.4);
    // nothing to follow: the bond is nearly the wedge's own line
    expect(lean(180)).toBeLessThan(0.1);
  });
});

describe("two double bonds sharing an atom", () => {
  // An explicit side is relative to the bond's own direction, so writing the
  // second bond the other way round genuinely puts its line on the far side
  // of the corner, with nothing there to meet. Auto and centre are read off
  // the drawing itself and must hold whichever way the bond is written.
  const modes: [Bond["doubleMode"] | undefined, boolean[]][] = [
    [undefined, [false, true]],
    ["center", [false, true]],
    ["left", [false]],
    ["right", [false]],
  ];
  // Written both ways round: the shared atom is the second bond's a1 in one
  // and its a2 in the other, and an offset read off the wrong end of a bond
  // puts its line on the side no other line will ever meet.
  const pair = (deg: number, mode: Bond["doubleMode"] | undefined, flip: boolean) => {
    const L = 1.8;
    const a = (deg * Math.PI) / 180;
    const atoms: Atom[] = [
      { id: 0, x: 0, y: 0, el: "C" },
      { id: 1, x: L, y: 0, el: "C" },
      { id: 2, x: L + L * Math.cos(Math.PI - a), y: L * Math.sin(Math.PI - a), el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 2, stereo: "none", doubleMode: mode },
      flip
        ? { a1: 2, a2: 1, order: 2, stereo: "none", doubleMode: mode }
        : { a1: 1, a2: 2, order: 2, stereo: "none", doubleMode: mode },
    ];
    return { atoms, bonds };
  };

  it("runs each line on to meet its neighbour's", () => {
    for (const [mode, flips] of modes) {
      for (const flip of flips) {
        for (const deg of [90, 120, 150]) {
          const { atoms, bonds } = pair(deg, mode, flip);
          const o = opts();
          const { lines } = buildAllPrimitives(atoms, bonds, o, 40);
          const at = { x: 1.8, y: 0 };
          // ends near the shared atom, but not on it: those are the lines
          // beside the bonds, which have to meet one another
          const loose = lines
            .flatMap((l) => [
              { x: l.x1, y: l.y1 },
              { x: l.x2, y: l.y2 },
            ])
            .filter((p) => {
              const d = Math.hypot(p.x - at.x, p.y - at.y);
              return d > 1e-6 && d < 1;
            });
          const why = `${mode ?? "auto"} ${deg} ${flip ? "flipped" : ""}`;
          expect([why, loose.length % 2]).toEqual([why, 0]);
          for (const p of loose) {
            const met = loose.some(
              (q) => q !== p && Math.hypot(q.x - p.x, q.y - p.y) < 1e-6,
            );
            expect([why, met]).toEqual([why, true]);
          }
        }
      }
    }
  });

  it("stops each line where a label they share cuts it, meeting nothing there", () => {
    // O=S=O, and C=C=C with the carbons labelled: the label takes the lines'
    // ends, so the first bond is drawn the same whether the second is double
    // or single. Run on to meet the other bond's lines, they cross the
    // letters - most plainly at a sulfonyl drawn nearly straight through.
    const cases: [string[], Partial<LayoutOptions>][] = [
      [["O", "S", "O"], {}],
      [["C", "C", "C"], { showCarbonLabels: true }],
    ];
    for (const [els, over] of cases) {
      for (const mode of ["center", "left", "right"] as const) {
        for (const deg of [90, 120, 179.99, 180]) {
          const ends = (second: 1 | 2) => {
            const { atoms, bonds } = pair(deg, "center", false);
            els.forEach((el, i) => (atoms[i].el = el));
            bonds[0].doubleMode = mode;
            bonds[1].order = second;
            const { lines } = buildAllPrimitives(atoms, bonds, opts(over), 40);
            // the first bond's lines: level, on the near side of the atom
            return lines
              .filter((l) => Math.abs(l.y1 - l.y2) < 1e-9)
              .filter((l) => Math.min(l.x1, l.x2) < 1.8 - 1e-6)
              .map((l) => [Math.max(l.x1, l.x2), l.y1].map((v) => +v.toFixed(6)))
              .sort((a, b) => a[1] - b[1]);
          };
          const why = `${els.join("")} ${mode} ${deg}`;
          expect([why, ends(2)]).toEqual([why, ends(1)]);
        }
      }
    }
  });
});

describe("which atoms are finished off at all", () => {
  // The drag preview draws the atom it carries itself, so it has to ask this
  // same question: a dot the drawing does not have must not appear while the
  // atom is moving.
  const degOf = (bonds: Bond[]) => {
    const m = new Map<number, number>();
    for (const b of bonds) {
      m.set(b.a1, (m.get(b.a1) ?? 0) + 1);
      m.set(b.a2, (m.get(b.a2) ?? 0) + 1);
    }
    return m;
  };
  const caps = (atoms: Atom[], bonds: Bond[]) =>
    joinsAtAtoms(atoms, bonds, opts(), degOf(bonds)).caps;

  it("caps a plain end and a plain join", () => {
    const atoms: Atom[] = [
      { id: 0, x: 0, y: 0, el: "C" },
      { id: 1, x: 1.8, y: 0, el: "C" },
      { id: 2, x: 2.7, y: 1.6, el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 1, stereo: "none" },
      { a1: 1, a2: 2, order: 1, stereo: "none" },
    ];
    expect([...caps(atoms, bonds)].sort()).toEqual([0, 1, 2]);
  });

  it("leaves a label, a wedge's wide end and a centred double alone", () => {
    const atoms: Atom[] = [
      { id: 0, x: 0, y: 0, el: "C" }, // stereocentre: the wedge's narrow end
      { id: 1, x: 1.8, y: 0, el: "C" }, // the wedge's wide end
      { id: 2, x: -0.9, y: 1.6, el: "O" }, // a label
      { id: 3, x: -0.9, y: -1.6, el: "C" },
      { id: 4, x: -1.8, y: -3.2, el: "C" }, // only centred doubles meet at 3
    ];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 1, stereo: "up" },
      { a1: 0, a2: 2, order: 1, stereo: "none" },
      { a1: 0, a2: 3, order: 1, stereo: "none" },
      { a1: 3, a2: 4, order: 2, stereo: "none", doubleMode: "center" },
    ];
    const got = caps(atoms, bonds);
    expect(got.has(1)).toBe(false); // the wedge covers its own join
    expect(got.has(2)).toBe(false); // the label takes the bond's end with it
    expect(got.has(4)).toBe(false); // nothing of a centred double reaches it
    expect(got.has(0)).toBe(true); // plain bonds meet here
    expect(got.has(3)).toBe(true); // a plain bond reaches here
  });

  it("caps a wavy bond at its stereocentre only, not at the atom its wave stops short of", () => {
    // the stereocentre 0 carries the wave and two plain bonds; the wave stops
    // at the top of a turn before 1, and a cap on 1 floated beyond it
    const atoms: Atom[] = [
      { id: 0, x: 0, y: 0, el: "C" },
      { id: 1, x: 1.8, y: 0, el: "C" },
      { id: 2, x: -0.9, y: 1.6, el: "C" },
      { id: 3, x: -0.9, y: -1.6, el: "C" },
    ];
    const bonds: Bond[] = [
      { a1: 1, a2: 0, order: 1, stereo: "wavy" }, // written far end first
      { a1: 0, a2: 2, order: 1, stereo: "none" },
      { a1: 0, a2: 3, order: 1, stereo: "none" },
    ];
    const got = caps(atoms, bonds);
    expect(got.has(1)).toBe(false);
    expect(got.has(0)).toBe(true);
    // and in the drawing: the wave's own free end is capped where it stops,
    // and nothing is left on the far atom
    const { fills } = buildAllPrimitives(atoms, bonds, opts({ joinStyle: "round" }), 40);
    expect(fills.some((f) => Math.hypot(f.c.x - 1.8, f.c.y) < 1e-9)).toBe(false);
  });
});

describe("a cage in perspective", () => {
  // two bonds crossing in an X: 0-1 behind, 2-3 in front
  const atoms = (withDepth: boolean): Atom[] => [
    { id: 0, x: -1, y: -1, el: "C", ...(withDepth ? { z: -1 } : {}) },
    { id: 1, x: 1, y: 1, el: "C", ...(withDepth ? { z: -1 } : {}) },
    { id: 2, x: -1, y: 1, el: "C", ...(withDepth ? { z: 1 } : {}) },
    { id: 3, x: 1, y: -1, el: "C", ...(withDepth ? { z: 1 } : {}) },
  ];
  const bonds: Bond[] = [
    { a1: 0, a2: 1, order: 1, stereo: "none" },
    { a1: 2, a2: 3, order: 1, stereo: "none" },
  ];

  it("breaks the bond behind where it passes under the one in front", () => {
    const { lines } = buildAllPrimitives(atoms(true), bonds, opts(), 40);
    // the back bond in two pieces, neither reaching the middle; the front whole
    const back = lines.filter((l) => Math.sign(l.x2 - l.x1) === Math.sign(l.y2 - l.y1));
    const front = lines.filter((l) => Math.sign(l.x2 - l.x1) !== Math.sign(l.y2 - l.y1));
    expect(back).toHaveLength(2);
    expect(front).toHaveLength(1);
    for (const l of back) {
      const nearest = Math.min(Math.hypot(l.x1, l.y1), Math.hypot(l.x2, l.y2));
      expect(nearest).toBeGreaterThan(0.05);
    }
  });

  it("draws crossing bonds whole where nothing says which is in front", () => {
    const { lines } = buildAllPrimitives(atoms(false), bonds, opts(), 40);
    expect(lines).toHaveLength(2);
  });
});

describe("charges, radicals and isotopes", () => {
  const L = NOMINAL_BOND_LENGTH;
  // methylamine as its ammonium, an alkoxide, a carbocation, a radical and 13C
  const atom = (id: number, x: number, y: number, el: string, extra: Partial<Atom> = {}): Atom => ({ id, x, y, el, ...extra });
  const single = (a1: number, a2: number): Bond => ({ a1, a2, order: 1 });
  const ammonium = [atom(0, 0, 0, "C"), atom(1, L, 0, "N", { charge: 1 })];
  const labelOf = (atoms: Atom[], bonds: Bond[], i: number, over: Partial<LayoutOptions> = {}) =>
    buildTextLabels(atoms, opts(over), bonds).find((t) => t.atom === i)!;

  it("writes a charge of one in its circle after the H, and plainly if asked", () => {
    const t = labelOf(ammonium, [single(0, 1)], 1);
    expect(t.runs!.map((r) => [r.text, r.sub ?? false, r.mark ?? null])).toEqual([
      ["N", false, null],
      ["H", false, null],
      ["3", true, null],
      ["+", false, "charge"],
    ]);
    const plain = labelOf(ammonium, [single(0, 1)], 1, { circleCharges: false });
    expect(plain.runs![plain.runs!.length - 1]).toEqual({ text: "+", sup: true });
  });

  it("sets the charge after the symbol when the H come first, and above the baseline", () => {
    // the bond leaves down to the right, as a zigzag's does: H3N+
    const left = [atom(0, L * 0.866, -L / 2, "C"), atom(1, 0, 0, "N", { charge: 1 })];
    const t = labelOf(left, [single(0, 1)], 1);
    expect(t.runs!.map((r) => r.text)).toEqual(["H", "3", "N", "+"]);
    const placed = placeLabel(t, 1);
    const n = placed.find((r) => r.text === "N")!;
    const mark = placed.find((r) => r.mark)!;
    expect(mark.x).toBeGreaterThan(n.x);
    expect(mark.y).toBeGreaterThan(n.y);
  });

  it("writes a charge of two or more plainly, as a superscript", () => {
    const iron = [atom(0, 0, 0, "Fe", { charge: 2 })];
    const t = buildTextLabels(iron, opts(), [])[0];
    expect(t.runs).toEqual([{ text: "Fe" }, { text: "2+", sup: true }]);
    const oxide = [atom(0, 0, 0, "C"), atom(1, L, 0, "O", { charge: -1 })];
    expect(labelOf(oxide, [single(0, 1)], 1).runs!.map((r) => r.text)).toEqual(["O", "−"]);
  });

  it("writes an isotope's mass number before the symbol, and shows a 13C's label", () => {
    const labelled = [atom(0, 0, 0, "C", { isotope: 13 }), atom(1, L, 0, "C")];
    // (its bond to the right, so its H come first: H3 13C)
    const t = labelOf(labelled, [single(0, 1)], 0);
    expect(t.runs!.map((r) => r.text)).toEqual(["H", "3", "13", "C"]);
    expect(t.runs![t.anchorRun! - 1]).toEqual({ text: "13", sup: true });
    expect(t.runs![t.anchorRun!]).toEqual({ text: "C" });
  });

  it("leaves a charged carbon a bare vertex, its charge beside it where its bonds leave room", () => {
    // a tertiary carbocation, its bonds down-left, down-right and up
    const cation = [
      atom(0, 0, 0, "C", { charge: 1 }),
      atom(1, -L * 0.866, -L / 2, "C"),
      atom(2, L * 0.866, -L / 2, "C"),
      atom(3, 0, L, "C"),
    ];
    const bonds = [single(0, 1), single(0, 2), single(0, 3)];
    const texts = buildTextLabels(cation, opts(), bonds);
    expect(texts.find((t) => t.atom === 0)).toBeUndefined();
    const beside = texts.find((t) => t.beside)!;
    expect(beside.runs).toEqual([{ text: "+", mark: "charge" }]);
    // up and to the right, between the bond up and the one down-right
    const angle = (Math.atan2(beside.y, beside.x) * 180) / Math.PI;
    expect(angle).toBeGreaterThan(15);
    expect(angle).toBeLessThan(75);
    // and with its C, where the style asks for it
    const shown = buildTextLabels(cation, opts({ showChargedCarbons: true }), bonds);
    expect(shown.find((t) => t.atom === 0)!.runs!.map((r) => r.text)).toEqual(["C", "+"]);
  });

  it("puts a charge a hand moved where it was put, the label without it - first just where it stood", () => {
    const o = opts();
    const set = labelSetOf(o);
    // ammonium's N+, after its H3: where the charge stands, taken from the label
    const t = labelOf(ammonium, [single(0, 1)], 1);
    const runs = t.runs!;
    const inline = markExtent(placeLabel(t, o.fontPx, set).filter((_, k) => isTail(runs, k, t.anchorRun ?? 0)), set);
    const at = { x: (inline.x - L) / o.fontPx, y: inline.y / o.fontPx };
    // (put just where it was: drawn just as it was)
    const moved = ammonium.map((a, i) => (i === 1 ? { ...a, chargeAt: at } : a));
    const texts = buildTextLabels(moved, o, [single(0, 1)]);
    expect(texts.find((x) => x.atom === 1)!.runs!.map((r) => r.text)).toEqual(["N", "H", "3"]);
    const beside = texts.find((x) => x.beside)!;
    expect(beside.markOf).toBe(1);
    const there = markExtent(placeLabel(beside, o.fontPx, set), set);
    expect(there.x).toBeCloseTo(inline.x, 9);
    expect(there.y).toBeCloseTo(inline.y, 9);
    // (put elsewhere: there)
    const far = buildTextLabels(ammonium.map((a, i) => (i === 1 ? { ...a, chargeAt: { x: -1, y: 2 } } : a)), o, [single(0, 1)]).find((x) => x.beside)!;
    expect(far.x).toBeCloseTo(L - o.fontPx, 9);
    expect(far.y).toBeCloseTo(2 * o.fontPx, 9);
    // (a carbon's beside its vertex likewise; and one moved with no charge to move: nothing drawn)
    const cation = [atom(0, 0, 0, "C", { charge: 1, chargeAt: { x: 1, y: -1 } }), atom(1, L, 0, "C")];
    const c = buildTextLabels(cation, o, [single(0, 1)]).find((x) => x.beside)!;
    expect([c.x, c.y, c.markOf]).toEqual([o.fontPx, -o.fontPx, 0]);
    expect(buildTextLabels([atom(0, 0, 0, "N", { chargeAt: { x: 1, y: 1 } })], o, []).some((x) => x.beside)).toBe(false);
  });

  it("sets a charge and a radical together beside a label clear of its letters, however long the pair", () => {
    // a pyridinium radical's N+•, its ring bonds up to either side: the pair goes below, beside the N
    const o = opts();
    const set = labelSetOf(o);
    const n = atom(0, 0, 0, "N", { charge: 1, radical: "doublet" });
    const ring = [n, atom(1, -L * Math.cos(Math.PI / 6), L / 2, "C"), atom(2, L * Math.cos(Math.PI / 6), L / 2, "C")];
    // (one of its ring bonds double, as in the ring: no H on it)
    const texts = buildTextLabels(ring, o, [single(0, 1), { ...single(0, 2), order: 2 }]);
    const beside = texts.find((t) => t.beside && t.markOf === 0)!;
    expect(beside.runs!.map((r) => r.mark)).toEqual(["charge", "radical"]);
    const label = texts.find((t) => t.atom === 0)!;
    expect(label.runs!.map((r) => r.text)).toEqual(["N"]);
    // (each item's outlines about where it stands)
    const at = (t: typeof label, hs: Vec2[][]) => hs.map((h) => h.map((p) => ({ x: p.x + t.x, y: p.y + t.y })));
    const letters = at(label, labelHulls(label, o.fontPx, set, false));
    const marks = at(beside, labelHulls(beside, o.fontPx, set));
    // no corner of the marks within the N's letters, nor of the letters within the marks
    for (const p of marks.flat()) for (const h of letters) expect(inside(p, h)).toBe(false);
    for (const p of letters.flat()) for (const h of marks) expect(inside(p, h)).toBe(false);
  });

  it("draws a circled charge's circle and sign, and a radical's dot, with the lines", () => {
    const layout = layoutMolecule(ammonium, [single(0, 1)], opts(), 30);
    const plain = layoutMolecule(ammonium.map((a) => ({ ...a, charge: undefined })), [single(0, 1)], opts(), 30);
    expect(layout.polys.length - plain.polys.length).toBe(40);
    expect(layout.lines.length - plain.lines.length).toBe(2);
    const radical = [atom(0, 0, 0, "C", { radical: "doublet" }), atom(1, L, 0, "C"), atom(2, -L, 0, "C")];
    const withDot = layoutMolecule(radical, [single(0, 1), single(0, 2)], opts(), 30);
    const without = layoutMolecule(radical.map((a) => ({ ...a, radical: undefined })), [single(0, 1), single(0, 2)], opts(), 30);
    expect(withDot.fills.length - without.fills.length).toBe(1);
  });

  it("counts the H a charge leaves: NH3+ on a methyl, none on O-", () => {
    expect(implicitHydrogens("N", 1, 1)).toBe(3);
    expect(implicitHydrogens("O", 1, -1)).toBe(0);
  });

  it("moves a label's charge off a bond that runs where it would go", () => {
    // a nitro group's N, its N=O up to the right where the charge would go
    const nitro = [
      atom(0, -L * 0.866, -L / 2, "C"),
      atom(1, 0, 0, "N", { charge: 1 }),
      atom(2, L * 0.866, L / 2, "O"),
      atom(3, 0, -L, "O", { charge: -1 }),
    ];
    const bonds: Bond[] = [single(0, 1), { a1: 1, a2: 2, order: 2 }, single(1, 3)];
    const texts = buildTextLabels(nitro, opts(), bonds);
    expect(texts.find((t) => t.atom === 1)!.runs).toEqual([{ text: "N" }]);
    const beside = texts.find((t) => t.beside && Math.hypot(t.x, t.y) < L)!;
    expect(beside.runs).toEqual([{ text: "+", mark: "charge" }]);
    // clear of the N=O at 30 degrees
    const angle = (Math.atan2(beside.y, beside.x) * 180) / Math.PI;
    expect(Math.abs(angle - 30)).toBeGreaterThan(40);
    // and a charge where nothing is in its way stays after the label
    const up = nitro.map((a) => (a.id === 2 ? { ...a, x: 0, y: L } : a));
    expect(buildTextLabels(up, opts(), bonds).find((t) => t.atom === 1)!.runs!.map((r) => r.text)).toEqual(["N", "+"]);
  });
});

describe("bonds a file can hold besides plain ones", () => {
  const L = NOMINAL_BOND_LENGTH;
  const at = (x: number, y: number, el = "C"): Atom => ({ id: Math.random(), x, y, el });
  // but-2-ene drawn as a zigzag: C1-C2=C3-C4
  const butene = [at(0, 0), at(L * 0.866, L / 2), at(L * 1.732, 0), at(L * 2.598, L / 2)];
  const zigzag: Bond[] = [
    { a1: 0, a2: 1, order: 1 },
    { a1: 1, a2: 2, order: 2, stereo: "either" },
    { a1: 2, a2: 3, order: 1 },
  ];

  it("shows a double bond of either configuration with a wave beside it (IUPAC ST-4.4)", () => {
    const drawn = unspecifiedDoubles(butene, zigzag);
    // the double bond itself plain, one substituent wavy
    expect(drawn[1].stereo).toBe("none");
    expect(drawn.filter((b) => b.stereo === "wavy")).toHaveLength(1);
    // the bonds as given are left as they were
    expect(zigzag[1].stereo).toBe("either");
  });

  it("puts no wave on a bond to another stereocentre", () => {
    // C1 a stereocentre: its wedge to C5
    const atoms = [...butene, at(-L * 0.866, L / 2)];
    const bonds: Bond[] = [...zigzag, { a1: 0, a2: 4, order: 1, stereo: "up" }];
    const drawn = unspecifiedDoubles(atoms, bonds);
    expect(drawn[0].stereo).not.toBe("wavy");
    expect(drawn[2].stereo).toBe("wavy");
  });

  it("waves both substituents of an end that has two, where neither end has one free", () => {
    // C2=C3, C3 bearing two methyls, C2's single substituent a stereocentre
    const atoms = [at(0, 0), at(L * 0.866, L / 2), at(L * 1.732, 0), at(L * 2.598, L / 2), at(L * 1.732, -L), at(-L * 0.866, L / 2)];
    const bonds: Bond[] = [
      { a1: 0, a2: 1, order: 1 },
      { a1: 1, a2: 2, order: 2, stereo: "either" },
      { a1: 2, a2: 3, order: 1 },
      { a1: 2, a2: 4, order: 1 },
      { a1: 0, a2: 5, order: 1, stereo: "up" },
    ];
    const drawn = unspecifiedDoubles(atoms, bonds);
    expect(drawn.map((b) => b.stereo === "wavy")).toEqual([false, false, true, true, false]);
  });

  it("adds nothing where the drawing shows no configuration: straight on", () => {
    const line = [at(0, 0), at(L, 0), at(2 * L, 0), at(3 * L, 0)];
    const drawn = unspecifiedDoubles(line, zigzag);
    expect(drawn.some((b) => b.stereo === "wavy")).toBe(false);
  });

  it("dots a hydrogen bond, at least three dots and no line, and gives it no hydrogen to take", () => {
    const atoms = [at(0, 0, "O"), at(L, 0, "O")];
    const layout = layoutMolecule(atoms, [{ a1: 0, a2: 1, order: 1, hydrogen: true }], opts({ units: "world", lineWidthPx: 0.05 }), 40);
    expect(layout.lines).toHaveLength(0);
    expect(layout.polys.length).toBeGreaterThanOrEqual(3);
    // each O still carries its two hydrogens
    expect(layout.texts.map((t) => t.text)).toEqual(["H2O", "OH2"]);
  });

  it("draws a coordination bond as a plain line, and an ammine keeps its three hydrogens", () => {
    const atoms = [at(0, 0, "Cu"), at(L, 0, "N")];
    const layout = layoutMolecule(atoms, [{ a1: 0, a2: 1, order: 1, coordination: true }], opts({ units: "world" }), 40);
    expect(layout.polys).toHaveLength(0);
    expect(layout.lines.length).toBeGreaterThan(0);
    expect(layout.texts.map((t) => t.text)).toContain("NH3");
  });

  it("labels a query bond beside its middle, small", () => {
    const atoms = [at(0, 0), at(L, 0)];
    const layout = layoutMolecule(atoms, [{ a1: 0, a2: 1, order: 1, query: "single-or-double" }], opts({ units: "world" }), 40);
    const label = layout.texts.find((t) => t.text === "S/D")!;
    expect(label.beside).toBe(true);
    expect(label.runs).toEqual([{ text: "S/D", sup: true }]);
    expect(label.x).toBeCloseTo(L / 2, 6);
    expect(Math.abs(label.y)).toBeGreaterThan(0);
  });
});

describe("runsPlaces", () => {
  it("lies each place where runsWidth measures the runs cut there, to the last bit", () => {
    const runs: TextRun[] = [{ text: "CH" }, { text: "3", sub: true }, { text: "" }, { text: "+", mark: "charge" }, { text: "a😀b", italic: true }, { text: "··", mark: "radical" }];
    const cut = (n: number) => {
      const out: TextRun[] = [];
      let left = n;
      for (const r of runs) {
        if (left <= 0) break;
        out.push(r.text.length <= left ? r : { ...r, text: r.text.slice(0, left) });
        left -= r.text.length;
      }
      return out;
    };
    const length = runs.reduce((n, r) => n + r.text.length, 0);
    const places = runsPlaces(runs, 1.7);
    expect(places).toHaveLength(length + 1);
    places.forEach((x, n) => expect(x).toBe(runsWidth(cut(n), 1.7)));
  });
});
