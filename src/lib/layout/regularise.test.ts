import { describe, expect, it } from "vitest";
import { closedUp, drawnAsChair, regularised, type DrawnAtom, type DrawnBond } from "./regularise";
import stilbene from "./fixtures/stilbene-sheared.json";

const L = 1.8;
const C = (x: number, y: number, more: Partial<DrawnAtom> = {}): DrawnAtom => ({ x, y, el: "C", ...more });
const lengths = (p: { x: number; y: number }[], bonds: readonly DrawnBond[]) => bonds.map((b) => Math.hypot(p[b.a].x - p[b.b].x, p[b.a].y - p[b.b].y));
const angleAt = (p: { x: number; y: number }[], a: number, at: number, b: number) => {
  const u = { x: p[a].x - p[at].x, y: p[a].y - p[at].y };
  const v = { x: p[b].x - p[at].x, y: p[b].y - p[at].y };
  return (Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / Math.hypot(u.x, u.y) / Math.hypot(v.x, v.y)))) * 180) / Math.PI;
};
const side = (p: { x: number; y: number }[], a: number, b: number, c: number) => Math.sign((p[b].x - p[a].x) * (p[c].y - p[a].y) - (p[b].y - p[a].y) * (p[c].x - p[a].x));
const ringOf = (n: number): DrawnBond[] => Array.from({ length: n }, (_, i) => ({ a: i, b: (i + 1) % n, order: 1 }));
const hexagon = (r: number, turn = 0) => Array.from({ length: 6 }, (_, i) => C(r * Math.cos(turn + (Math.PI / 3) * i), r * Math.sin(turn + (Math.PI / 3) * i)));

describe("a structure as drawn, made regular with its arrangement kept", () => {
  it("a ring drawn uneven - one side short - is a regular ring where it is drawn, turned as it is drawn", () => {
    const drawn = hexagon(L, 0.2);
    // (one corner pulled in: its two sides short)
    drawn[0] = C(drawn[0].x * 0.8, drawn[0].y * 0.8);
    const p = regularised(drawn, ringOf(6), L)!;
    expect(p).not.toBeNull();
    for (const l of lengths(p, ringOf(6))) expect(l).toBeCloseTo(L, 6);
    for (let i = 0; i < 6; i++) expect(angleAt(p, (i + 5) % 6, i, (i + 1) % 6)).toBeCloseTo(120, 4);
    // (each corner by where it is drawn)
    for (let i = 0; i < 6; i++) expect(Math.hypot(p[i].x - drawn[i].x, p[i].y - drawn[i].y)).toBeLessThan(0.5 * L);
  });

  it("a chain drawn with uneven angles and bonds is a zigzag of the style's bond, turning each way it is drawn to", () => {
    // (turning up, down, down - a chain's turn kept - its bonds long and short)
    const drawn = [C(0, 0), C(1.5, 1.1), C(3.6, 0.2), C(4.4, -1.6), C(6.4, -2)];
    const bonds: DrawnBond[] = [0, 1, 2, 3].map((i) => ({ a: i, b: i + 1, order: 1 }));
    const p = regularised(drawn, bonds, L)!;
    expect(p).not.toBeNull();
    for (const l of lengths(p, bonds)) expect(l).toBeCloseTo(L, 6);
    for (let i = 1; i < 4; i++) {
      expect(angleAt(p, i - 1, i, i + 1)).toBeCloseTo(120, 4);
      expect(side(p, i - 1, i, i + 1)).toBe(side(drawn, i - 1, i, i + 1));
    }
  });

  it("a group on a ring goes out along the ring's bisector; two on one atom, a twelfth of a turn either side", () => {
    const ring = hexagon(L);
    const drawn = [...ring, C(2 * L * 0.98, 0.3), C(-1.9 * L, 0.6), C(-1.8 * L, -0.9)];
    const bonds = [...ringOf(6), { a: 0, b: 6, order: 1 }, { a: 3, b: 7, order: 1 }, { a: 3, b: 8, order: 1 }];
    const p = regularised(drawn, bonds, L)!;
    expect(p).not.toBeNull();
    for (const l of lengths(p, bonds)) expect(l).toBeCloseTo(L, 6);
    expect(angleAt(p, 1, 0, 6)).toBeCloseTo(120, 4);
    expect(angleAt(p, 5, 0, 6)).toBeCloseTo(120, 4);
    expect(angleAt(p, 7, 3, 8)).toBeCloseTo(60, 4);
  });

  it("a ring drawn as a chair, a perspective drawing, is left as drawn - and its substituents the way they are drawn, axial and equatorial", () => {
    // (a cyclohexane chair as a textbook draws it: three pairs of parallel opposite bonds, its outline not convex)
    const chair = [C(0, 0), C(1.4, -0.5), C(2.8, 0.4), C(4, 0.1), C(2.6, 0.6), C(1.2, -0.3)];
    expect(drawnAsChair(chair)).toBe(true);
    // (an axial methyl straight up from the corner at the right, an equatorial one off the left corner)
    const drawn = [...chair, C(4, 0.1 + L), C(0 - 1.7, -0.6)];
    const bonds = [...ringOf(6), { a: 3, b: 6, order: 1 }, { a: 0, b: 7, order: 1 }];
    const p = regularised(drawn, bonds, L)!;
    expect(p).not.toBeNull();
    // (its form as drawn, the piece about where it is drawn)
    for (let i = 1; i < 6; i++) expect(Math.hypot(p[i].x - p[0].x - (chair[i].x - chair[0].x), p[i].y - p[0].y - (chair[i].y - chair[0].y))).toBeLessThan(1e-6);
    // (each the way it is drawn, the style's bond long)
    expect(Math.atan2(p[6].y - p[3].y, p[6].x - p[3].x)).toBeCloseTo(Math.PI / 2, 6);
    expect(Math.atan2(p[7].y - p[0].y, p[7].x - p[0].x)).toBeCloseTo(Math.atan2(-0.6, -1.7), 6);
    for (const l of lengths(p, bonds.slice(6))) expect(l).toBeCloseTo(L, 6);
  });

  it("a hexagon drawn flat but uneven - squashed - is none of a chair", () => {
    expect(drawnAsChair(hexagon(L).map((a) => C(a.x * 1.3, a.y * 0.6)))).toBe(false);
    expect(drawnAsChair(hexagon(L))).toBe(false);
  });

  it("a ring drawn squashed, far past half a bond from the regular one, still snaps to it, centred and turned as drawn", () => {
    const drawn = hexagon(L, 0.3).map((a) => C(a.x * 1.45, a.y * 0.6));
    const p = regularised(drawn, ringOf(6), L)!;
    expect(p).not.toBeNull();
    for (const l of lengths(p, ringOf(6))) expect(l).toBeCloseTo(L, 6);
    for (let i = 0; i < 6; i++) expect(angleAt(p, (i + 5) % 6, i, (i + 1) % 6)).toBeCloseTo(120, 4);
    const mid = (q: { x: number; y: number }[]) => ({ x: q.reduce((t, a) => t + a.x, 0) / q.length, y: q.reduce((t, a) => t + a.y, 0) / q.length });
    expect(Math.hypot(mid(p).x - mid(drawn).x, mid(p).y - mid(drawn).y)).toBeLessThan(1e-6);
  });

  it("fused rings drawn skewed - a 6-6 sheared, a 6-5 pulled - snap to the regular system", () => {
    // (naphthalene drawn sheared: x moved by a third of y)
    const shear = (a: DrawnAtom) => C(a.x + a.y / 3, a.y);
    const h = Math.sqrt(3) * L;
    const naph = [C(0, L), C(h / 2, L * 1.5), C(h, L), C(h, 0), C(h / 2, -L / 2), C(0, 0), C(1.5 * h, L * 1.5), C(2 * h, L), C(2 * h, 0), C(1.5 * h, -L / 2)].map(shear);
    const naphBonds = [...ringOf(6), { a: 2, b: 6, order: 1 }, { a: 6, b: 7, order: 1 }, { a: 7, b: 8, order: 1 }, { a: 8, b: 9, order: 1 }, { a: 9, b: 3, order: 1 }];
    const p = regularised(naph, naphBonds, L)!;
    expect(p).not.toBeNull();
    for (const l of lengths(p, naphBonds)) expect(l).toBeCloseTo(L, 4);
    for (let i = 0; i < 6; i++) expect(angleAt(p, (i + 5) % 6, i, (i + 1) % 6)).toBeCloseTo(120, 2);
    // (indane: its five-membered ring's far corner pulled out)
    const indane = [...hexagon(L, Math.PI / 6), C(-0.9 * L, 1.9 * L), C(-2.3 * L, 1.4 * L), C(-2 * L, 0.2 * L)];
    // (the hexagon's corners 2 and 3 - at 150 deg and 210 deg - shared with the five)
    const indBonds = [...ringOf(6), { a: 2, b: 6, order: 1 }, { a: 6, b: 7, order: 1 }, { a: 7, b: 8, order: 1 }, { a: 8, b: 3, order: 1 }];
    const q = regularised(indane, indBonds, L)!;
    expect(q).not.toBeNull();
    for (const l of lengths(q, indBonds)) expect(l).toBeCloseTo(L, 4);
    for (let i = 0; i < 6; i++) expect(angleAt(q, (i + 5) % 6, i, (i + 1) % 6)).toBeCloseTo(120, 2);
  });

  it("an atom not read for sure does not turn the ring it is in, nor stops it being made regular, however far off it is drawn", () => {
    const drawn = hexagon(L, 0.1);
    drawn[2] = C(drawn[2].x + 1.2, drawn[2].y + 0.9, { unsure: true });
    const p = regularised(drawn, ringOf(6), L)!;
    expect(p).not.toBeNull();
    // (the others where they are drawn, the ring as turned as they are)
    for (const i of [0, 1, 3, 4, 5]) expect(Math.hypot(p[i].x - drawn[i].x, p[i].y - drawn[i].y)).toBeLessThan(1e-6);
  });

  it("a ring with a bond into it from a chain keeps both, the chain met along the ring's bisector", () => {
    const ring = hexagon(L).map((a) => C(a.x + 3 * L, a.y));
    const drawn = [C(0, 0.4), C(1.2 * L, -0.2), ...ring];
    // (the chain's second atom bonded to the ring's corner facing it)
    const bonds = [{ a: 0, b: 1, order: 1 }, { a: 1, b: 5, order: 1 }, ...ringOf(6).map((b) => ({ a: b.a + 2, b: b.b + 2, order: 1 }))];
    const p = regularised(drawn, bonds, L)!;
    expect(p).not.toBeNull();
    for (const l of lengths(p, bonds)) expect(l).toBeCloseTo(L, 6);
    expect(angleAt(p, 1, 5, 4)).toBeCloseTo(120, 4);
    expect(angleAt(p, 1, 5, 6)).toBeCloseTo(120, 4);
  });

  it("round a metal, or an atom of more than four bonds, keeps each bond the way it is drawn, the style's length", () => {
    const pd = regularised([{ x: 0, y: 0, el: "Pd" }, C(1.3, 0.4)], [{ a: 0, b: 1, order: 1 }], L)!;
    expect(lengths(pd, [{ a: 0, b: 1, order: 1 }])[0]).toBeCloseTo(L, 6);
    expect(Math.atan2(pd[1].y - pd[0].y, pd[1].x - pd[0].x)).toBeCloseTo(Math.atan2(0.4, 1.3), 6);
    const s = [{ x: 0, y: 0, el: "S" }, ...Array.from({ length: 6 }, (_, i) => ({ x: 1.4 * Math.cos(i), y: 1.4 * Math.sin(i), el: "F" }))];
    const sBonds = s.slice(1).map((_, i) => ({ a: 0, b: i + 1, order: 1 }));
    const p = regularised(s, sBonds, L)!;
    for (const l of lengths(p, sBonds)) expect(l).toBeCloseTo(L, 6);
    for (let i = 1; i < 7; i++) expect(Math.atan2(p[i].y - p[0].y, p[i].x - p[0].x)).toBeCloseTo(Math.atan2(s[i].y, s[i].x), 6);
  });

  it("a stereocentre the standard angles would leave with a wedge set straight across from another bond keeps its bonds' ways as drawn", () => {
    // (a carbon of four bonds, one wedged, drawn with a gap the cross would close to a straight line)
    const drawn = [C(0, 0), C(0, -L), C(L * Math.cos(29 * (Math.PI / 180)), L * Math.sin(29 * (Math.PI / 180))), C(L * Math.cos(98 * (Math.PI / 180)), L * Math.sin(98 * (Math.PI / 180))), C(L * Math.cos(151 * (Math.PI / 180)), L * Math.sin(151 * (Math.PI / 180)))];
    const bonds = [{ a: 0, b: 1, order: 1, stereo: true }, { a: 0, b: 2, order: 1 }, { a: 0, b: 3, order: 1, stereo: true }, { a: 0, b: 4, order: 1 }];
    const p = regularised(drawn, bonds, L)!;
    const at = (i: number) => Math.atan2(p[i].y - p[0].y, p[i].x - p[0].x);
    expect(Math.abs(Math.abs(at(1) - at(3)) - Math.PI)).toBeGreaterThan(5 * (Math.PI / 180));
    for (const l of lengths(p, bonds)) expect(l).toBeCloseTo(L, 6);
  });

  it("an E-stilbene drawn sheared comes out regular, each phenyl met along its bisector, every angle a third of a turn (the correctness lane's case)", () => {
    const p = regularised(stilbene.atoms, stilbene.bonds, L)!;
    expect(p).not.toBeNull();
    for (const l of lengths(p, stilbene.bonds)) expect(l).toBeCloseTo(L, 4);
    const around = (u: number) => stilbene.bonds.flatMap((b) => (b.a === u ? [b.b] : b.b === u ? [b.a] : []));
    for (let u = 0; u < p.length; u++) {
      const ns = around(u);
      for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) expect(angleAt(p, ns[i], u, ns[j])).toBeCloseTo(120, 2);
    }
    // (E as drawn: the two rings on opposite sides of the double bond)
    expect(side(p, 6, 7, 8) * side(p, 7, 6, 5)).toBe(side(stilbene.atoms, 6, 7, 8) * side(stilbene.atoms, 7, 6, 5));
  });

  it("a result that closes a group up on its neighbour, where the drawing has it open, is caught: a chain's corner at 75 deg, or 95, drawn at 120", () => {
    // (a carbon of three bonds, a chain's: drawn 120 deg between each; one come out turned in)
    const drawn = [C(0, 0), C(L, 0), C(-L / 2, (L * Math.sqrt(3)) / 2), C(-L / 2, (-L * Math.sqrt(3)) / 2)];
    const turnedIn = (deg: number) => C(L * Math.cos((deg * Math.PI) / 180), L * Math.sin((deg * Math.PI) / 180));
    const mol = { neighbours: [[1, 2, 3], [0], [0], [0]], ringBonds: new Set<string>() };
    expect(closedUp([drawn[0], drawn[1], turnedIn(75), drawn[3]], drawn, mol)).toBe(true);
    expect(closedUp([drawn[0], drawn[1], turnedIn(95), drawn[3]], drawn, mol)).toBe(true);
    // (turned only a little, or drawn as narrow: not)
    expect(closedUp([drawn[0], drawn[1], turnedIn(110), drawn[3]], drawn, mol)).toBe(false);
    expect(closedUp([drawn[0], drawn[1], turnedIn(95), drawn[3]], [drawn[0], drawn[1], turnedIn(90), drawn[3]], mol)).toBe(false);
    // (an atom of four bonds - its standard a cross, 90 deg - is not held to it)
    const four = { neighbours: [[1, 2, 3, 4], [0], [0], [0], [0]], ringBonds: new Set<string>() };
    expect(closedUp([C(0, 0), C(L, 0), C(0, L), C(-L, 0), C(0, -L)], [C(0, 0), C(L, 0), turnedIn(120), turnedIn(200), turnedIn(290)], four)).toBe(false);
  });

  it("a chain's atom of three bonds drawn skewed - an acyl chloride's carbon at 90 and 150 deg - comes out a third of a turn apart, each on its side", () => {
    // (N, then the carbon, its Cl drawn 90 deg from the N and its O 150 deg the other way round)
    const at = (deg: number, r = L) => C(r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180));
    const drawn = [C(0, 0), at(70), { ...at(70 + 90 + 180, L), el: "Cl" }, { ...at(70 - 150 + 180, L), el: "O" }].map((a, i) => (i < 2 ? a : { ...a, x: a.x + drawnAt1().x, y: a.y + drawnAt1().y }));
    function drawnAt1() {
      return at(70);
    }
    drawn[0] = { ...drawn[0], el: "N" };
    const bonds = [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }, { a: 1, b: 3, order: 2 }];
    const p = regularised(drawn, bonds, L)!;
    expect(p).not.toBeNull();
    expect(angleAt(p, 0, 1, 2)).toBeCloseTo(120, 4);
    expect(angleAt(p, 0, 1, 3)).toBeCloseTo(120, 4);
    expect(side(p, 0, 1, 2)).toBe(side(drawn, 0, 1, 2));
    expect(side(p, 0, 1, 3)).toBe(side(drawn, 0, 1, 3));
  });

  it("a double bond's end drawn straight - its way round not given - stays straight, and gains no E or Z", () => {
    // (CH3-CH=CH-CH3 drawn with its ends nearly in line with the double bond)
    const drawn = [C(0, 0.1), C(L, 0), C(2 * L, 0), C(3 * L, -0.1)];
    const bonds = [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 2 }, { a: 2, b: 3, order: 1 }];
    const p = regularised(drawn, bonds, L)!;
    expect(p).not.toBeNull();
    expect(angleAt(p, 0, 1, 2)).toBeCloseTo(180, 4);
    expect(angleAt(p, 1, 2, 3)).toBeCloseTo(180, 4);
  });
});
