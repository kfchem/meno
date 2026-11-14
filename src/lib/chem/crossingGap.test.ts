import { describe, expect, it } from "vitest";
import { createSVG, buildAllPrimitives, CROSSING_CLEAR, CROSSING_CLEAR_FLOOR_PX, CROSSING_LEAST_ANGLE_DEG, CROSSING_LEAST_BREAK, layoutMolecule, type Atom, type Bond, type LayoutOptions, type Poly, type Vec2 } from "./layout2d";
import { layoutEmf, emfRecords } from "./emf";
import { acsWorldOptions, NOMINAL_BOND_LENGTH as L } from "./acs";

// A bond behind another is drawn with a gap (Brecher 2006, ST-3.1: "the front-to-back ordering of crossing bonds must be indicated. That ordering is
// depicted with a small discontinuity in the backmost bond"; "at least twice as wide as the width of a single bond" for print). The gap is a band along
// the bond in front: each cut end of the bond behind runs PARALLEL to it. The front bond lies along x, its atoms in front (z 1); the back bond crosses it
// at an angle, its atoms behind (z -1). Every number here is worked by hand from the style's line width: lineWidthPx 0.075 (world units), a half width
// 0.0375, and CROSSING_CLEAR = 2 line widths of clear space = 0.15.

const ZOOM = 40;
const LINE = 0.075;
const HALF = LINE / 2;
const CLEAR = CROSSING_CLEAR * LINE;
const style = (over: Partial<LayoutOptions> = {}): LayoutOptions => acsWorldOptions([], [], { units: "world", minLinePx: 0, joinStyle: "round", ...over });
const rad = (deg: number) => (deg * Math.PI) / 180;
const closeTo = (a: number, b: number, digits = 9) => expect(a).toBeCloseTo(b, digits);

type Scene = { front?: Partial<Bond>; back?: Partial<Bond>; at?: number; over?: Partial<LayoutOptions>; zoom?: number; others?: { atoms: Atom[]; bonds: Bond[] } };
/** The back bond crossing the front at `deg`, through (at, 0); the front from (-L, 0) to (L, 0). */
function scene(deg: number, s: Scene = {}) {
  const t = rad(deg);
  const x = s.at ?? 0;
  const atoms: Atom[] = [
    { id: 0, x: -L, y: 0, el: "C", z: 1 },
    { id: 1, x: L, y: 0, el: "C", z: 1 },
    { id: 2, x: x - L * Math.cos(t), y: -L * Math.sin(t), el: "C", z: -1 },
    { id: 3, x: x + L * Math.cos(t), y: L * Math.sin(t), el: "C", z: -1 },
    ...(s.others?.atoms ?? []),
  ];
  const bonds: Bond[] = [{ a1: 0, a2: 1, order: 1, ...s.front }, { a1: 2, a2: 3, order: 1, ...s.back }, ...(s.others?.bonds ?? [])];
  const o = style(s.over);
  return { atoms, bonds, o, ...buildAllPrimitives(atoms, bonds, o, s.zoom ?? ZOOM) };
}
/** The pieces of the back bond: the shapes reaching well off the front bond (a cut line is drawn as the shape it fills). */
const pieces = (polys: Poly[]) => polys.filter((p) => Math.max(...p.points.map((q) => Math.abs(q.y))) > 0.3);
/** A piece's cut edge: its points nearest the front bond, and how far that is. */
function cutEdge(piece: Poly): { near: number; points: Vec2[] } {
  const near = Math.min(...piece.points.map((q) => Math.abs(q.y)));
  return { near, points: piece.points.filter((q) => Math.abs(Math.abs(q.y) - near) < 1e-9) };
}
/** The clear space each piece leaves: from the front's edge (`front`, its half width) to the piece's cut edge, square to the front. */
const clears = (polys: Poly[], front: number) => pieces(polys).map((p) => cutEdge(p).near - front);

describe("the gap where a bond passes behind another", () => {
  it("leaves the same clear space at every angle: two line widths each side of a plain bond in front, square to it, from its edge to the cut end", () => {
    for (const joinStyle of ["round", "sharp"] as const) {
      for (const deg of [90, 60, 45, 30, 15]) {
        const { polys } = scene(deg, { over: { joinStyle } });
        expect(pieces(polys), `${deg}`).toHaveLength(2);
        for (const c of clears(polys, HALF)) closeTo(c, CLEAR);
      }
    }
  });

  it("cuts each end parallel to the bond in front: the cut edge two corners at one distance from it, at 90, 45, 30 and 15 degrees, for a plain, a double, a bold and a wedge bond behind", () => {
    const backs: Partial<Bond>[] = [{}, { order: 2 }, { display: "bold" }, { stereo: "up" }, { display: "wedge" }];
    for (const back of backs) {
      for (const deg of [90, 45, 30, 15]) {
        const { polys } = scene(deg, { back });
        const ps = pieces(polys);
        expect(ps.length, JSON.stringify(back) + deg).toBeGreaterThanOrEqual(2);
        for (const p of ps) {
          const edge = cutEdge(p);
          // (two corners on the band's edge, so the edge between them lies along x, the front bond's direction)
          expect(edge.points.length, JSON.stringify(back) + deg).toBeGreaterThanOrEqual(2);
          closeTo(edge.near, HALF + CLEAR);
        }
      }
    }
  });

  it("draws no cap at a cut: nothing round is left at a cut end, where the style finishes ends round", () => {
    for (const deg of [90, 45, 15]) {
      const { fills } = scene(deg, { over: { joinStyle: "round" } });
      // (the front's own end caps, far from the crossing, aside)
      for (const f of fills.filter((x) => Math.hypot(x.c.x, x.c.y) < 1)) expect(Math.abs(f.c.y) < HALF + CLEAR + 2 * HALF, `${deg}`).toBe(false);
    }
  });

  it("cuts a plain bond crossing a plain one at a right angle where it always was: 5 half widths each side of the crossing", () => {
    const { polys } = scene(90);
    for (const p of pieces(polys)) closeTo(cutEdge(p).near, 5 * HALF);
    expect(CLEAR).toBeCloseTo(4 * HALF, 12);
  });

  it("never leaves a break under the text's minimum: twice a single bond's width, square to the bond in front, at every angle and for every front", () => {
    expect(CROSSING_LEAST_BREAK).toBe(2);
    const fronts: Partial<Bond>[] = [{}, { display: "bold" }, { stereo: "up" }, { stereo: "down" }, { order: 2 }, { order: 3 }];
    for (const front of fronts) {
      for (const deg of [90, 60, 45, 30, 15]) {
        const ps = pieces(scene(deg, { front }).polys);
        // (where the break takes the whole short bond - a triple bond across it at 15 degrees - nothing is left to measure)
        if (!ps.length) continue;
        expect(ps, JSON.stringify(front) + deg).toHaveLength(2);
        const [a, b] = ps.map((p) => cutEdge(p));
        expect(a.near + b.near).toBeGreaterThanOrEqual(CROSSING_LEAST_BREAK * LINE - 1e-12);
      }
    }
  });

  describe("the width of what is drawn in front", () => {
    it("gives a bold bond in front the room its own width needs: the bold bond's half width 0.125 and the clear space", () => {
      for (const deg of [90, 45, 15]) {
        const { polys } = scene(deg, { front: { display: "bold" } });
        const bold = polys.find((p) => Math.max(...p.points.map((q) => Math.abs(q.y))) < 0.2)!;
        const half = Math.max(...bold.points.map((q) => Math.abs(q.y)));
        closeTo(half, 0.125, 3);
        for (const c of clears(polys, half)) closeTo(c, CLEAR);
      }
    });

    it("gives a wedge its width where the bond crosses it: wide and narrow ends differ, the clear space the same", () => {
      const nears: number[] = [];
      for (const at of [-1.2, 0, 1.2]) {
        const { polys } = scene(90, { front: { stereo: "up" }, at });
        const wedge = polys.find((p) => Math.max(...p.points.map((q) => Math.abs(q.y))) < 0.25)!.points;
        const ys: number[] = [];
        wedge.forEach((p, i) => {
          const q = wedge[(i + 1) % wedge.length];
          if ((p.x - at) * (q.x - at) < 0) ys.push(p.y + ((q.y - p.y) * (at - p.x)) / (q.x - p.x));
        });
        const half = Math.max(...ys.map(Math.abs));
        for (const c of clears(polys, half)) closeTo(c, CLEAR);
        nears.push(cutEdge(pieces(polys)[0]).near);
      }
      // (the wedge is wider where its wide end is: the break is wider there)
      expect(nears[2]).toBeGreaterThan(nears[0] + 0.05);
    });

    it("breaks the bond behind a double or a triple bond in front once, across the whole of it: from the outer edge of the outer line, no stub between its lines", () => {
      for (const order of [2, 3] as const) {
        const { lines, polys } = scene(90, { front: { order } });
        const outer = Math.max(...lines.filter((l) => Math.abs(l.y2 - l.y1) < 1e-9).map((l) => Math.abs(l.y1)));
        expect(outer).toBeGreaterThan(0.1);
        expect(pieces(polys), `${order}`).toHaveLength(2);
        for (const c of clears(polys, outer + HALF)) closeTo(c, CLEAR);
      }
    });

    it("breaks the bond behind a double bond whose second line is offset to one side, as a ring's is, across both lines, each side by the clear space, whichever side it is on", () => {
      for (const sign of [1, -1]) {
        const others = {
          atoms: [{ id: 4, x: -1.5 * L, y: sign * 0.866 * L, el: "C" }, { id: 5, x: 1.5 * L, y: sign * 0.866 * L, el: "C" }] as Atom[],
          bonds: [{ a1: 0, a2: 4, order: 1 }, { a1: 1, a2: 5, order: 1 }] as Bond[],
        };
        const { lines, polys } = scene(90, { front: { order: 2 }, others });
        const front = lines.filter((l) => Math.abs(l.y2 - l.y1) < 1e-9 && Math.abs(l.y1) < 0.5 && l.x2 - l.x1 > 2);
        expect(front, `${sign}`).toHaveLength(2);
        const [lo, hi] = [Math.min(...front.map((l) => l.y1)) - HALF, Math.max(...front.map((l) => l.y1)) + HALF];
        expect(Math.abs(Math.abs(lo) - Math.abs(hi))).toBeGreaterThan(0.1);
        const ps = pieces(polys).filter((p) => p.points.every((q) => Math.abs(q.x) < 0.1));
        expect(ps, `${sign}`).toHaveLength(2);
        const top = ps.find((p) => p.points[0].y > 0)!;
        const bottom = ps.find((p) => p.points[0].y < 0)!;
        closeTo(Math.min(...top.points.map((q) => q.y)), hi + CLEAR);
        closeTo(Math.max(...bottom.points.map((q) => q.y)), lo - CLEAR);
      }
    });

    it("breaks the bond behind a hashed bond in front where the stroke nearest the crossing reaches: the whole stroke and the clear space, drawn as lines or as shapes", () => {
      for (const joinStyle of ["round", "sharp"] as const) {
        const { polys } = scene(90, { front: { stereo: "down" }, over: { joinStyle } });
        const ps = pieces(polys);
        expect(ps, joinStyle).toHaveLength(2);
        // (the stroke nearest the crossing, at x = 0.156, reaches 0.075 either side, a stroke's width more drawn as a line)
        const reach = cutEdge(ps[0]).near - CLEAR;
        expect(reach).toBeGreaterThan(0.07);
        expect(reach).toBeLessThan(0.12);
      }
    });
  });

  describe("what is cut of the bond behind", () => {
    it("cuts every line of a double bond behind along the same band: four pieces, the cut edges at one distance from the front", () => {
      for (const deg of [90, 60]) {
        const ps = pieces(scene(deg, { back: { order: 2 } }).polys);
        expect(ps).toHaveLength(4);
        for (const p of ps) closeTo(cutEdge(p).near, HALF + CLEAR);
      }
    });

    it("takes out every stroke of a hashed bond behind that reaches into the band, and leaves the others whole", () => {
      for (const joinStyle of ["round", "sharp"] as const) {
        const { lines, polys } = scene(90, { back: { stereo: "down" }, over: { joinStyle } });
        const strokes = [...lines.filter((l) => Math.abs(l.x1) < 0.2 && Math.abs(l.y2 - l.y1) < 1e-9 && Math.abs(l.y1) > 1e-9).map((l) => [{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }]), ...polys.map((p) => p.points)];
        expect(strokes.length, joinStyle).toBeGreaterThan(5);
        for (const s of strokes) expect(Math.min(...s.map((q) => Math.abs(q.y))), joinStyle).toBeGreaterThanOrEqual(HALF + CLEAR - 1e-9);
      }
    });

    it("cuts the shape of a bold bar, a solid wedge or a wedge-shaped ring bond behind into two, one wholly each side of the gap", () => {
      for (const back of [{ display: "bold" as const }, { stereo: "up" as const }, { display: "wedge" as const }]) {
        const { polys } = scene(90, { back });
        expect(polys, JSON.stringify(back)).toHaveLength(2);
        const sides = polys.map((p) => {
          const ys = p.points.map((q) => q.y);
          const below = ys.every((y) => y <= -5 * HALF + 1e-9);
          const above = ys.every((y) => y >= 5 * HALF - 1e-9);
          expect(below || above, JSON.stringify(back)).toBe(true);
          return below ? -1 : 1;
        });
        expect([...sides].sort()).toEqual([-1, 1]);
      }
    });

    it("draws a cut line as the shape it fills: a band of the line's width along the bond, its uncut end square and whole - for a plain and a double bond behind", () => {
      for (const back of [{}, { order: 2 as const }]) {
        for (const deg of [90, 45, 15]) {
          const ps = pieces(scene(deg, { back }).polys);
          const t = rad(deg);
          const dir = { x: Math.cos(t), y: Math.sin(t) };
          for (const p of ps) {
            // (every corner within the line's half width of its own axis, and two of them exactly at it either side: a band, not tapered)
            const across = p.points.map((q) => q.x * -dir.y + q.y * dir.x);
            closeTo(Math.max(...across) - Math.min(...across), LINE, 9);
            const far = Math.max(...p.points.map((q) => Math.abs(q.x * dir.x + q.y * dir.y)));
            const end = p.points.filter((q) => Math.abs(Math.abs(q.x * dir.x + q.y * dir.y) - far) < 1e-9);
            // (the uncut end: two corners, a line's width apart, square to the bond)
            expect(end, JSON.stringify(back) + deg).toHaveLength(2);
            closeTo(Math.abs((end[0].x - end[1].x) * -dir.y + (end[0].y - end[1].y) * dir.x), LINE, 9);
          }
        }
      }
    });

    it("draws a line no band reaches as the line it is", () => {
      const { lines, polys } = scene(90);
      expect(lines).toHaveLength(1);
      expect(Math.abs(lines[0].y1)).toBe(0);
      expect(pieces(polys)).toHaveLength(2);
    });
  });

  describe("breaks and ends", () => {
    it("makes bands that overlap one gap: two bonds in front close together leave the bond behind in two pieces, far apart in three", () => {
      const front2 = (y: number): { atoms: Atom[]; bonds: Bond[] } => ({
        atoms: [{ id: 10, x: -L, y, el: "C", z: 1 }, { id: 11, x: L, y, el: "C", z: 1 }],
        bonds: [{ a1: 4, a2: 5, order: 1 }],
      });
      const back = (polys: Poly[]) => polys.filter((p) => p.points.every((q) => Math.abs(q.x) < 0.1));
      expect(back(scene(90, { others: front2(0.25) }).polys)).toHaveLength(2);
      expect(back(scene(90, { others: front2(1.0) }).polys)).toHaveLength(3);
    });

    it("draws no crumb: a piece of the bond behind - a line or a shape - left shorter than the clear space beside a break is not drawn", () => {
      for (const back of [{}, { display: "bold" as const }, { stereo: "up" as const }]) {
        const make = (top: number) => {
          const atoms: Atom[] = [
            { id: 0, x: -L, y: 0, el: "C", z: 1 },
            { id: 1, x: L, y: 0, el: "C", z: 1 },
            { id: 2, x: 0, y: -1, el: "C", z: -1 },
            { id: 3, x: 0, y: top, el: "C", z: -1 },
          ];
          return buildAllPrimitives(atoms, [{ a1: 0, a2: 1, order: 1 }, { a1: 2, a2: 3, order: 1, ...back }], style(), ZOOM).polys.filter((p) => p.points.some((q) => Math.abs(q.y) > 0.15));
        };
        // (the break takes the bond to 0.1875; the end at 0.25 leaves 0.0625, under the clear space 0.15; the end at 0.4 leaves 0.2125)
        expect(make(0.25), JSON.stringify(back)).toHaveLength(1);
        expect(make(0.4), JSON.stringify(back)).toHaveLength(2);
      }
    });

    it("cuts nothing of bonds all but along each other: under the least angle", () => {
      expect(CROSSING_LEAST_ANGLE_DEG).toBe(10);
      expect(pieces(scene(5).polys)).toHaveLength(0);
      expect(scene(5).lines).toHaveLength(2);
      expect(pieces(scene(12).polys)).toHaveLength(2);
    });
  });

  describe("on a page of pixels", () => {
    it("keeps the clear space to at least CROSSING_CLEAR_FLOOR_PX device pixels where lines are drawn in pixels, and to the style's where they are not (a vector writer)", () => {
      expect(CROSSING_CLEAR_FLOOR_PX).toBe(3);
      const zoom = 8;
      const vector = scene(90, { zoom, over: { minLinePx: 0 } });
      const vHalf = Math.max(0.5, 0.075 * zoom) / zoom / 2;
      for (const c of clears(vector.polys, vHalf)) closeTo(c, CLEAR);
      const raster = scene(90, { zoom, over: { minLinePx: 1 } });
      const front = raster.lines.find((l) => Math.abs(l.y2 - l.y1) < 1e-9)!;
      const rHalf = front.widthPx / zoom / 2;
      for (const c of clears(raster.polys, rHalf)) closeTo(c * zoom, CROSSING_CLEAR_FLOOR_PX, 6);
    });
  });

  describe("in every writer the back bond is in pieces with nothing between", () => {
    const atoms: Atom[] = [
      { id: 0, x: -L, y: 0, el: "C", z: 1 },
      { id: 1, x: L, y: 0, el: "C", z: 1 },
      { id: 2, x: -L * 0.5, y: -L, el: "C", z: -1 },
      { id: 3, x: L * 0.5, y: L, el: "C", z: -1 },
    ];
    const bonds: Bond[] = [{ a1: 0, a2: 1, order: 1 }, { a1: 2, a2: 3, order: 1 }];
    const o = acsWorldOptions(atoms, bonds, { units: "world", bondColor: "#123456" });
    const layout = layoutMolecule(atoms, bonds, o, ZOOM);
    const inGap = (q: Vec2) => Math.abs(q.y) < HALF + CLEAR - 1e-9;

    it("the layout, which the page draws, has the front's line and the back's two pieces, and nothing in the gap", () => {
      expect(layout.lines).toHaveLength(1);
      expect(layout.polys.filter((p) => p.points.some((q) => Math.abs(q.y) > 0.3))).toHaveLength(2);
      for (const p of layout.polys) for (const q of p.points) if (Math.abs(q.x) < 0.5) expect(inGap(q)).toBe(false);
      for (const f of layout.fills) expect(Math.hypot(f.c.x, f.c.y)).toBeGreaterThan(0.1);
    });

    it("the SVG writes the pieces as two shapes in the bonds' colour, and nothing in any other colour", () => {
      const svg = createSVG(layout, o);
      expect([...svg.matchAll(/<line /g)]).toHaveLength(1);
      const colours = [...svg.matchAll(/(?:stroke|fill)="(#[0-9a-fA-F]{6}|white)"/g)].map((m) => m[1].toLowerCase());
      expect(new Set(colours)).toEqual(new Set(["#123456"]));
    });

    it("the EMF draws the front as a polyline and the back as two filled shapes, nothing else", () => {
      const types = emfRecords(layoutEmf(layout, o).emf)!.map((r) => r.type);
      expect(types.filter((t) => t === 4)).toHaveLength(1); // polyline
      expect(types.filter((t) => t === 3 || t === 86).length).toBeGreaterThanOrEqual(2); // polygon (16-bit or not)
      for (const painted of [42, 43]) expect(types).not.toContain(painted); // ellipse, rectangle
    });
  });
});

