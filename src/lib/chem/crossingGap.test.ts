import { describe, expect, it } from "vitest";
import { createSVG, buildAllPrimitives, CROSSING_CLEAR, CROSSING_CLEAR_FLOOR_PX, CROSSING_LEAST_ANGLE_DEG, CROSSING_LEAST_BREAK, layoutMolecule, type Atom, type Bond, type LayoutOptions, type LineSeg, type Vec2 } from "./layout2d";
import { layoutEmf, emfRecords } from "./emf";
import { acsWorldOptions, NOMINAL_BOND_LENGTH as L } from "./acs";

// A bond behind another is drawn with a gap (Brecher 2006, ST-3.1: "the front-to-back ordering of crossing bonds must be indicated. That ordering is
// depicted with a small discontinuity in the backmost bond"; "at least twice as wide as the width of a single bond" for print). The front bond lies along x,
// its atoms in front (z 1); the back bond crosses it at the origin at an angle, its atoms behind (z -1). Every number here is worked by hand from the
// style's line width: lineWidthPx 0.075 (world units), a half width 0.0375, and CROSSING_CLEAR = 2 line widths of clear space = 0.15.

const ZOOM = 40;
const LINE = 0.075;
const HALF = LINE / 2;
const CLEAR = CROSSING_CLEAR * LINE;
const style = (over: Partial<LayoutOptions> = {}): LayoutOptions => acsWorldOptions([], [], { units: "world", minLinePx: 0, joinStyle: "round", ...over });
const rad = (deg: number) => (deg * Math.PI) / 180;

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
/** The lines of the back bond: those not lying along x, and longer than a hash's stroke (0.3 at most). */
const backLines = (lines: LineSeg[]) => lines.filter((l) => (Math.abs(l.y2 - l.y1) > 1e-9 || Math.abs(l.x2 - l.x1) < 1e-9) && Math.hypot(l.x2 - l.x1, l.y2 - l.y1) > 0.4);
/** For each piece of the back bond, the end nearer the crossing. */
const inner = (pieces: LineSeg[]): Vec2[] => pieces.map((l) => (Math.hypot(l.x1, l.y1) < Math.hypot(l.x2, l.y2) ? { x: l.x1, y: l.y1 } : { x: l.x2, y: l.y2 }));
/** The least distance from the cut ends to the front bond's edge (the front lying along x, its half width `front`): square to it, the nearest corner of a flat end, the centre of a round one's cap. */
function clearOf(pieces: LineSeg[], deg: number, front: number, round: boolean): number {
  const lean = round ? 0 : HALF * Math.abs(Math.cos(rad(deg)));
  return Math.min(...inner(pieces).map((p) => Math.abs(p.y) - lean - front));
}
const closeTo = (a: number, b: number, digits = 9) => expect(a).toBeCloseTo(b, digits);

describe("the gap where a bond passes behind another", () => {
  it("leaves the same clear space at every angle: two line widths each side of a plain bond in front, square to it, from its edge to the cut end", () => {
    for (const joinStyle of ["round", "sharp"] as const) {
      for (const deg of [90, 60, 45, 30, 15]) {
        const { lines } = scene(deg, { over: { joinStyle } });
        const back = backLines(lines);
        expect(back, `${deg}`).toHaveLength(2);
        closeTo(clearOf(back, deg, HALF, joinStyle === "round"), CLEAR);
      }
    }
  });

  it("cuts a plain bond crossing a plain one at a right angle as it always was: 5 half widths each side of the crossing", () => {
    const { lines } = scene(90);
    const ends = inner(backLines(lines)).map((p) => Math.abs(p.y)).sort();
    ends.forEach((y) => closeTo(y, 5 * HALF));
    expect(CLEAR).toBeCloseTo(4 * HALF, 12);
  });

  it("cuts (the front's half width there + the clear space) / sin(the angle) along the back bond", () => {
    for (const deg of [60, 45, 30, 15]) {
      const { lines } = scene(deg, { over: { joinStyle: "round" } });
      for (const p of inner(backLines(lines))) closeTo(Math.hypot(p.x, p.y), (HALF + CLEAR) / Math.sin(rad(deg)));
    }
  });

  it("never leaves a break under the text's minimum: twice a single bond's width, measured square to the bond in front, at every angle and for every front", () => {
    expect(CROSSING_LEAST_BREAK).toBe(2);
    const fronts: Partial<Bond>[] = [{}, { display: "bold" }, { stereo: "up" }, { stereo: "down" }, { order: 2 }, { order: 3 }];
    for (const front of fronts) {
      for (const deg of [90, 60, 45, 30, 15]) {
        const { lines } = scene(deg, { front });
        const ends = inner(backLines(lines));
        // (where the break takes the whole short bond - a triple bond across it at 15 degrees - nothing is left to measure)
        if (!ends.length) {
          expect(front.order, `${deg}`).toBe(3);
          continue;
        }
        expect(ends, JSON.stringify(front) + deg).toHaveLength(2);
        const across = Math.abs(ends[0].y - ends[1].y);
        expect(across).toBeGreaterThanOrEqual(CROSSING_LEAST_BREAK * LINE - 1e-12);
      }
    }
  });

  describe("the width of what is drawn in front", () => {
    it("gives a bold bond in front the room its own width needs: the bold bond's half width 0.125 and the clear space", () => {
      for (const deg of [90, 45, 15]) {
        const { lines, polys } = scene(deg, { front: { display: "bold" } });
        const bold = Math.max(...polys[0].points.map((p) => Math.abs(p.y)));
        closeTo(bold, 0.125, 3);
        closeTo(clearOf(backLines(lines), deg, bold, true), CLEAR);
      }
    });

    it("gives a wedge its width where the bond crosses it: wide and narrow ends differ, the clear space the same", () => {
      for (const at of [-1.2, 0, 1.2]) {
        const { lines, polys } = scene(90, { front: { stereo: "up" }, at });
        // (the wedge's half width at x = at: the polygon's edge crossing there)
        const poly = polys[0].points;
        const ys: number[] = [];
        poly.forEach((p, i) => {
          const q = poly[(i + 1) % poly.length];
          if ((p.x - at) * (q.x - at) < 0) ys.push(p.y + ((q.y - p.y) * (at - p.x)) / (q.x - p.x));
        });
        const half = Math.max(...ys.map(Math.abs));
        const pieces = backLines(lines);
        // (the cut is square to the wedge's axis: the wedge's far edge is its half width off the axis, the near edge the same)
        closeTo(clearOf(pieces, 90, half, true), CLEAR);
      }
      // (the wedge is wider where its wide end is: the break is wider there)
      const [narrow, wide] = [-1.2, 1.2].map((at) => inner(backLines(scene(90, { front: { stereo: "up" }, at }).lines)).map((p) => Math.abs(p.y))[0]);
      expect(wide).toBeGreaterThan(narrow + 0.05);
    });

    it("breaks the bond behind a double or a triple bond in front once, across the whole of it: from the outer edge of the outer line, no stub between its lines", () => {
      for (const order of [2, 3] as const) {
        const { lines } = scene(90, { front: { order } });
        const front = lines.filter((l) => Math.abs(l.y2 - l.y1) < 1e-9);
        const outer = Math.max(...front.map((l) => Math.abs(l.y1)));
        expect(outer).toBeGreaterThan(0.1);
        const back = backLines(lines);
        // (two pieces only, and the cut ends past the outer line's edge by the clear space)
        expect(back, `${order}`).toHaveLength(2);
        closeTo(clearOf(back, 90, outer + HALF, true), CLEAR);
      }
    });

    it("breaks the bond behind a hashed bond in front where the stroke nearest the crossing reaches: the whole stroke and the clear space, drawn as lines or as shapes", () => {
      for (const joinStyle of ["round", "sharp"] as const) {
        const { lines } = scene(90, { front: { stereo: "down" }, over: { joinStyle } });
        const pieces = lines.filter((l) => Math.abs(l.x1) < 1e-9 && Math.abs(l.x2) < 1e-9 && Math.abs(l.y2 - l.y1) > 0.2);
        expect(pieces, joinStyle).toHaveLength(2);
        // (the stroke nearest the crossing, at x = 0.156, reaches 0.075 either side, 0.0375 more for the round one's width; the break is a stroke wider each side)
        const reach = Math.abs(inner(pieces)[0].y) - CLEAR;
        expect(reach).toBeGreaterThan(0.06);
        expect(reach).toBeLessThan(0.12);
      }
    });
  });

  describe("what is cut of the bond behind", () => {
    it("cuts every line of a double bond behind over the same span along it", () => {
      for (const deg of [90, 60]) {
        const { lines } = scene(deg, { back: { order: 2 } });
        const pieces = backLines(lines);
        expect(pieces).toHaveLength(4);
        // (the same span along the bond: the inner ends of the two lines on one side at the same place along it)
        const t = rad(deg);
        const along = inner(pieces).map((p) => p.x * Math.cos(t) + p.y * Math.sin(t));
        const sorted = [...along].sort((a, b) => a - b);
        closeTo(sorted[0], sorted[1], 9);
        closeTo(sorted[2], sorted[3], 9);
      }
    });

    it("cuts every stroke of a hashed bond behind that lies in the break, and no other", () => {
      const { lines } = scene(90, { back: { stereo: "down" } });
      const strokes = lines.filter((l) => Math.abs(l.y2 - l.y1) < 1e-9 && Math.abs(l.x1) < 0.2 && l.x1 !== l.x2);
      expect(strokes.length).toBeGreaterThan(5);
      // (none within the break: 0.188 either side of the crossing; the front's own line aside)
      const ys = strokes.filter((l) => Math.abs(l.y1) > 1e-9).map((l) => Math.abs(l.y1));
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(5 * HALF - 1e-9);
      // (and the strokes outside are whole: the bond had eleven, the break takes the two between -0.188 and 0.188, at -0.165 and 0.156)
      expect(ys.length).toBe(9);
      // (drawn as shapes, where joins are sharp: the same, no shape reaches into the break)
      const sharp = scene(90, { back: { stereo: "down" }, over: { joinStyle: "sharp" } });
      expect(sharp.polys.length).toBeGreaterThan(5);
      for (const p of sharp.polys) expect(Math.min(...p.points.map((q) => Math.abs(q.y)))).toBeGreaterThanOrEqual(5 * HALF - 1e-9);
    });

    it("cuts the shape of a bold bond behind into two, each ending at the clear space", () => {
      const { polys } = scene(90, { back: { display: "bold" } });
      expect(polys).toHaveLength(2);
      for (const p of polys) {
        const near = Math.min(...p.points.map((q) => Math.abs(q.y)));
        closeTo(near, 5 * HALF);
      }
    });
  });

  describe("breaks and ends", () => {
    it("makes breaks that overlap one: two bonds in front close together leave the bond behind in two pieces, far apart in three", () => {
      const front2 = (y: number): { atoms: Atom[]; bonds: Bond[] } => ({
        atoms: [{ id: 10, x: -L, y, el: "C", z: 1 }, { id: 11, x: L, y, el: "C", z: 1 }],
        bonds: [{ a1: 4, a2: 5, order: 1 }],
      });
      const close = scene(90, { others: front2(0.25) });
      expect(backLines(close.lines).filter((l) => Math.abs(l.x1) < 1e-9 && Math.abs(l.x2) < 1e-9)).toHaveLength(2);
      const far = scene(90, { others: front2(1.0) });
      expect(backLines(far.lines).filter((l) => Math.abs(l.x1) < 1e-9 && Math.abs(l.x2) < 1e-9)).toHaveLength(3);
    });

    it("draws no crumb: a piece of the bond behind left shorter than the clear space beside a break is not drawn", () => {
      // (the back bond from (0, -1) to (0, 0.25): the break takes it to 0.1875, leaving 0.0625 < 0.15)
      const atoms: Atom[] = [
        { id: 0, x: -L, y: 0, el: "C", z: 1 },
        { id: 1, x: L, y: 0, el: "C", z: 1 },
        { id: 2, x: 0, y: -1, el: "C", z: -1 },
        { id: 3, x: 0, y: 0.25, el: "C", z: -1 },
      ];
      const bonds: Bond[] = [{ a1: 0, a2: 1, order: 1 }, { a1: 2, a2: 3, order: 1 }];
      const { lines } = buildAllPrimitives(atoms, bonds, style(), ZOOM);
      const vertical = (ls: LineSeg[]) => ls.filter((l) => Math.abs(l.x1) < 1e-9 && Math.abs(l.x2) < 1e-9);
      expect(vertical(lines)).toHaveLength(1);
      // (and where the end is far enough, it is drawn)
      const far = buildAllPrimitives(atoms.map((a) => (a.id === 3 ? { ...a, y: 0.5 } : a)), bonds, style(), ZOOM);
      expect(vertical(far.lines)).toHaveLength(2);
    });

    it("cuts nothing of bonds all but along each other: under the least angle", () => {
      expect(CROSSING_LEAST_ANGLE_DEG).toBe(10);
      expect(backLines(scene(5).lines)).toHaveLength(1);
      expect(backLines(scene(12).lines)).toHaveLength(2);
    });

    it("finishes the ends of the break as before: a cap at each where joins are round", () => {
      const round = scene(60, { over: { joinStyle: "round" } });
      for (const p of inner(backLines(round.lines))) expect(round.fills.some((f) => Math.hypot(f.c.x - p.x, f.c.y - p.y) < 1e-9)).toBe(true);
    });
  });

  describe("on a page of pixels", () => {
    it("keeps the clear space to at least CROSSING_CLEAR_FLOOR_PX device pixels where lines are drawn in pixels, and to the style's where they are not (a vector writer)", () => {
      expect(CROSSING_CLEAR_FLOOR_PX).toBe(3);
      const zoom = 8;
      // (vector: no floor - the clear space is the style's 0.15 world units, 1.2 pixels at this zoom)
      const vector = scene(90, { zoom, over: { minLinePx: 0 } });
      const vHalf = Math.max(0.5, 0.075 * zoom) / zoom / 2;
      closeTo(clearOf(backLines(vector.lines), 90, vHalf, true), Math.max(CLEAR, 0), 9);
      // (pixels: at least three device pixels, the line itself one device pixel wide at least)
      const raster = scene(90, { zoom, over: { minLinePx: 1 } });
      const front = raster.lines.find((l) => Math.abs(l.y2 - l.y1) < 1e-9)!;
      const rHalf = front.widthPx / zoom / 2;
      const clear = clearOf(backLines(raster.lines), 90, rHalf, true);
      expect(clear * zoom).toBeGreaterThanOrEqual(CROSSING_CLEAR_FLOOR_PX - 1e-9);
      closeTo(clear * zoom, CROSSING_CLEAR_FLOOR_PX, 6);
      expect(clear).toBeGreaterThan(CLEAR);
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

    it("the layout, which the page draws, has the pieces and nothing over the gap: no fill or shape between them", () => {
      expect(layout.lines).toHaveLength(3);
      expect(layout.polys).toHaveLength(0);
      for (const f of layout.fills) expect(Math.hypot(f.c.x, f.c.y)).toBeGreaterThan(0.1);
    });

    it("the SVG writes the back bond as two lines and paints nothing in any other colour", () => {
      const svg = createSVG(layout, o);
      expect([...svg.matchAll(/<line /g)]).toHaveLength(3);
      const strokes = [...svg.matchAll(/stroke="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(strokes)).toEqual(new Set(["#123456"]));
      expect(svg).not.toMatch(/<rect|<polygon|<ellipse|fill="#ffffff"|fill="white"/i);
    });

    it("the EMF draws the back bond as two polylines and paints nothing: no polygon, no rectangle, no ellipse", () => {
      const { emf } = layoutEmf(layout, o);
      const types = emfRecords(emf)!.map((r) => r.type);
      expect(types.filter((t) => t === 4)).toHaveLength(3); // polyline
      for (const painted of [3, 42, 43]) expect(types).not.toContain(painted); // polygon, ellipse, rectangle
    });
  });
});

