import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH as L } from "../../../../lib/chem/acs";
import { chair } from "../../../../lib/chem/perception/projection/solids";
import { drawn } from "../../../../lib/chem/perception/projection/views";
import { identityOfDrawn } from "../chem/identityOf";
import type { Atom, Bond, Model } from "../store/types";
import { chairDrawing, chairOf, depthRings, FIRST_FORM, flipChairMoves, seenPlaces, snapTo, type ChairDrawing } from "./chair";

const draw = (flip = false, form: 0 | 1 = 0) => chairDrawing({ at: { x: 0, y: 0 }, form, flip, firstId: 1, firstBondId: 100, length: L });

/** The chair with a methyl on each (atom, face) given: the group's atom at the free position of that face (axial or equatorial, as the face is). */
function methylated(d: ChairDrawing, groups: [number, 1 | -1][]): Model {
  const atoms: Atom[] = [...d.atoms];
  const bonds: Bond[] = [...d.bonds];
  groups.forEach(([k, face], i) => {
    const free = d.solid.free.find((f) => f.at === k && f.face === face)!;
    const place = seenPlaces(d, k).find((p) => p.free === free)!;
    const id = 50 + i;
    atoms.push({ id, el: "C", r: 0.9, x: place.place.x, y: place.place.y });
    bonds.push({ id: 200 + i, a: d.ring[k], b: id, order: 1 });
  });
  return { atoms, bonds };
}

describe("the chair tool's drawing", () => {
  it("is the chair as the textbook draws it, in form 1 (from above and from the right) first: every ring bond the style's bond length, its middle at the point given, each atom's depth its true view's", () => {
    expect(FIRST_FORM).toBe(1);
    const d = chairDrawing({ at: { x: 10, y: -4 }, firstId: 1, firstBondId: 100 });
    const want = drawn(chair(), 1)!;
    const bondLengths = d.bonds.map((b) => Math.hypot(d.atoms[b.a - 1].x - d.atoms[b.b - 1].x, d.atoms[b.a - 1].y - d.atoms[b.b - 1].y));
    for (const length of bondLengths) expect(length).toBeCloseTo(L, 9);
    d.atoms.forEach((a, i) => {
      expect(a.x).toBeCloseTo(10 + want.atoms[i].x * L, 9);
      expect(a.y).toBeCloseTo(-4 + want.atoms[i].y * L, 9);
      expect(a.z).toBeCloseTo(want.atoms[i].z * L, 9);
    });
    expect(d.atoms.reduce((s, a) => s + a.x, 0) / 6).toBeCloseTo(10, 9);
    expect(d.atoms.reduce((s, a) => s + a.y, 0) / 6).toBeCloseTo(-4, 9);
    expect([d.atoms.length, d.bonds.length, d.ring]).toEqual([6, 6, [1, 2, 3, 4, 5, 6]]);
    expect(d.atoms.every((a) => a.stereoCentre && a.el === "C")).toBe(true);
  });

  it("draws every bond plain: a ring in perspective is drawn with plain bonds (Brecher 2006, ST-3.3)", () => {
    for (const flip of [false, true]) for (const form of [0, 1] as const) expect(draw(flip, form).bonds.every((b) => b.display == null && b.stereo == null)).toBe(true);
  });

  it("is the other textbook chair in its second form, and the ring flip's own picture when flipped", () => {
    const one = draw(false, 0);
    const two = draw(false, 1);
    // (each the other's mirror picture: the same points with x turned about)
    for (const p of one.atoms) expect(two.atoms.some((q) => Math.abs(q.x + p.x) < 1e-9 && Math.abs(q.y - p.y) < 1e-9)).toBe(true);
    // (the ring flip takes each atom's height to its other side: the two end atoms keep their x, and every atom's y changes by the heights)
    const flip = draw(true, 0);
    for (const i of [0, 3]) expect(flip.atoms[i].x).toBeCloseTo(one.atoms[i].x, 9);
    flip.atoms.forEach((a, i) => expect(a.y - one.atoms[i].y).not.toBeCloseTo(0, 3));
    expect(flip.atoms.map((a, i) => Math.sign(a.y - one.atoms[i].y))).toEqual([-1, 1, -1, 1, -1, 1]);
  });

  it("offers the two free positions of an atom as the page sees them: an axial bond upright, an equatorial one leaning out of the ring", () => {
    const d = draw();
    for (let k = 0; k < 6; k++) {
      const [axial, equatorial] = [seenPlaces(d, k).find((p) => p.free.kind === "axial")!, seenPlaces(d, k).find((p) => p.free.kind === "equatorial")!];
      expect(Math.abs(axial.place.x - d.atoms[k].x)).toBeLessThan(1e-9);
      expect(Math.sign(axial.place.y - d.atoms[k].y)).toBe(axial.free.face);
      expect(Math.abs(equatorial.place.x - d.atoms[k].x)).toBeGreaterThan(0.1);
    }
  });

  it("snaps a dragged bond to the free position nearest the pointer's direction at every atom, and offers none already held", () => {
    const d = draw();
    for (let k = 0; k < 6; k++) {
      const [axial, equatorial] = [seenPlaces(d, k).find((p) => p.free.kind === "axial")!, seenPlaces(d, k).find((p) => p.free.kind === "equatorial")!];
      const at = d.atoms[k];
      // (the pointer far out along each position's own direction, and a little to one side of it)
      for (const target of [axial, equatorial]) {
        const dx = target.place.x - at.x;
        const dy = target.place.y - at.y;
        for (const turn of [-0.2, 0, 0.2]) {
          const c = Math.cos(turn);
          const s = Math.sin(turn);
          const pointer = { x: at.x + 5 * (dx * c - dy * s), y: at.y + 5 * (dx * s + dy * c) };
          expect(snapTo(d, k, pointer)?.free.kind).toBe(target.free.kind);
        }
      }
      expect(snapTo(d, k, { x: at.x, y: at.y + 9 }, ["axial"])?.free.kind).toBe("equatorial");
      expect(snapTo(d, k, { x: at.x, y: at.y + 9 }, ["axial", "equatorial"])).toBeNull();
    }
  });
});

describe("what the chair tool draws, read as Meno reads a drawing (known answers)", () => {
  it("states the configuration of every centre a group makes: the drawing is complete and unread nowhere", () => {
    const m = methylated(draw(), [[0, 1]]);
    const r = identityOfDrawn(m);
    expect(r.unread).toEqual([]);
    expect(r.complete).toBe(true);
    // (methylcyclohexane has no stereocentre: one group alone says nothing to read)
    const two = identityOfDrawn(methylated(draw(), [[0, 1], [1, -1]]));
    expect(two.text).toContain("@");
  });

  it("makes trans-1,2-dimethylcyclohexane diequatorial and, flipped, diaxial the same identity, each group keeping its face; cis another", () => {
    // (atoms 0 and 1 are neighbours; groups on opposite faces are trans, on one face cis)
    const trans = [[0, 1], [1, -1]] as [number, 1 | -1][];
    const cis = [[0, 1], [1, 1]] as [number, 1 | -1][];
    const a = identityOfDrawn(methylated(draw(false), trans));
    const flippedTrans = identityOfDrawn(methylated(draw(true), trans));
    expect(flippedTrans.text).toBe(a.text);
    const c = identityOfDrawn(methylated(draw(false), cis));
    expect(identityOfDrawn(methylated(draw(true), cis)).text).toBe(c.text);
    expect(c.text).not.toBe(a.text);
    // (the other textbook chair is the same compound too)
    expect(identityOfDrawn(methylated(draw(false, 1), trans)).text).toBe(a.text);
  });

  it("makes a group on an axial position and the same group by face on the flipped chair equatorial: the same compound", () => {
    // (a 1,3 pair: trans is axial-equatorial, cis diaxial or diequatorial)
    const cis13 = [[0, 1], [2, 1]] as [number, 1 | -1][];
    const diaxial = methylated(draw(), cis13);
    const flip = methylated(draw(true), cis13);
    expect(identityOfDrawn(diaxial).text).toBe(identityOfDrawn(flip).text);
    expect(identityOfDrawn(diaxial).complete).toBe(true);
  });
});

describe("flipping a chair on a page", () => {
  const apply = (m: Model, moves: Map<number, { x: number; y: number; z?: number }>): Model => ({
    atoms: m.atoms.map((a) => (moves.has(a.id) ? { ...a, ...moves.get(a.id)! } : a)),
    bonds: m.bonds,
  });

  it("finds the chair the tool put down, in either view and either flip, and no ring drawn otherwise", () => {
    for (const form of [0, 1] as const) {
      for (const flip of [false, true]) {
        const d = draw(flip, form);
        // (the unflipped chair of the second view is the picture of the first view's flip, its atoms numbered otherwise: found as either)
        const found = chairOf({ atoms: d.atoms }, d.ring)!;
        expect(found).not.toBeNull();
        expect(found.index.size).toBe(6);
      }
    }
    const d = draw();
    expect(depthRings({ atoms: d.atoms, bonds: d.bonds }).map((r) => [...r].sort())).toEqual([[1, 2, 3, 4, 5, 6]]);
    // (a ring moved by hand is none)
    const moved = d.atoms.map((a, i) => (i === 2 ? { ...a, x: a.x + 0.3 } : a));
    expect(chairOf({ atoms: moved }, d.ring)).toBeNull();
    // (a flat ring: no depth)
    expect(chairOf({ atoms: d.atoms.map(({ z: _z, ...a }) => a) }, d.ring)).toBeNull();
  });

  it("takes trans-1,2-dimethylcyclohexane from diequatorial to diaxial, each group on its face - the compound the same - and back", () => {
    const d = draw();
    const m = methylated(d, [[0, 1], [1, -1]]);
    const before = identityOfDrawn(m);
    const moves = flipChairMoves(m, d.ring)!;
    expect(moves).not.toBeNull();
    const after = apply(m, moves);
    // (the groups' bonds now stand where the flipped chair's free positions on the same faces are)
    const flipped = draw(true);
    const expected = methylated(flipped, [[0, 1], [1, -1]]);
    for (const a of expected.atoms) expect([a.id, Math.round(after.atoms.find((x) => x.id === a.id)!.x * 1e6), Math.round(after.atoms.find((x) => x.id === a.id)!.y * 1e6)]).toEqual([a.id, Math.round(a.x * 1e6), Math.round(a.y * 1e6)]);
    expect(identityOfDrawn(after).text).toBe(before.text);
    expect(identityOfDrawn(after).complete).toBe(true);
    // (and back: the first picture again)
    const back = apply(after, flipChairMoves(after, d.ring)!);
    for (const a of m.atoms) expect(back.atoms.find((x) => x.id === a.id)!.x).toBeCloseTo(a.x, 9);
  });

  it("carries a group with everything beyond it: an ethyl's second carbon moves with its first", () => {
    const d = draw();
    const m = methylated(d, [[0, 1]]);
    const first = m.atoms.find((a) => a.id === 50)!;
    const second: Atom = { id: 70, el: "C", r: 0.9, x: first.x + 1, y: first.y + 0.2 };
    const ethyl: Model = { atoms: [...m.atoms, second], bonds: [...m.bonds, { id: 300, a: 50, b: 70, order: 1 }] };
    const moves = flipChairMoves(ethyl, d.ring)!;
    const [dx, dy] = [moves.get(50)!.x - first.x, moves.get(50)!.y - first.y];
    expect(moves.get(70)!.x - second.x).toBeCloseTo(dx, 9);
    expect(moves.get(70)!.y - second.y).toBeCloseTo(dy, 9);
  });

  it("refuses a chair with a group drawn at neither of its atom's free positions: nothing is guessed", () => {
    const d = draw();
    const m = methylated(d, [[0, 1]]);
    const stray: Model = { atoms: m.atoms.map((a) => (a.id === 50 ? { ...a, x: a.x + 0.4 } : a)), bonds: m.bonds };
    expect(flipChairMoves(stray, d.ring)).toBeNull();
  });
});

describe("a bond dragged out of a chair's atom", () => {
  it("ends at the free position nearest the pointer, named, and at none where both places hold a group", async () => {
    const { chairExtension } = await import("./extend");
    const d = draw();
    const k = 2;
    const at = d.atoms[k];
    const [axial, equatorial] = [seenPlaces(d, k).find((p) => p.free.kind === "axial")!, seenPlaces(d, k).find((p) => p.free.kind === "equatorial")!];
    const pointer = (p: { place: { x: number; y: number } }) => ({ x: at.x + 5 * (p.place.x - at.x), y: at.y + 5 * (p.place.y - at.y) });
    const bare = { atoms: d.atoms, bonds: d.bonds };
    const a = chairExtension(bare, d.ring[k], pointer(axial))!;
    expect(a.name).toBe("axial");
    expect(a.end.x).toBeCloseTo(axial.place.x, 9);
    expect(a.end.y).toBeCloseTo(axial.place.y, 9);
    expect(chairExtension(bare, d.ring[k], pointer(equatorial))!.name).toBe("equatorial");
    // (the axial place held: the pointer at it offers the other)
    const held = methylated(d, [[k, axial.free.face]]);
    expect(chairExtension(held, d.ring[k], pointer(axial))!.name).toBe("equatorial");
    // (both held: none, and the stroke goes as any)
    const both = methylated(d, [[k, axial.free.face], [k, equatorial.free.face]]);
    expect(chairExtension(both, d.ring[k], pointer(axial))).toBeNull();
    // (an atom of no chair: none)
    expect(chairExtension({ atoms: [{ id: 1, el: "C", r: 0.9, x: 0, y: 0 }], bonds: [] }, 1, { x: 5, y: 5 })).toBeNull();
  });
});

describe("cyclohexane's chair with its twelve hydrogens drawn at the tool's places", () => {
  /** How many pairs of the drawing's bonds cross on the page, away from their ends. */
  function crossings(m: Model): number {
    const at = new Map(m.atoms.map((a) => [a.id, a]));
    const cross = (p: Atom, q: Atom, r: Atom, s: Atom) => {
      const d = { x: q.x - p.x, y: q.y - p.y };
      const e = { x: s.x - r.x, y: s.y - r.y };
      const den = d.x * e.y - d.y * e.x;
      if (Math.abs(den) < 1e-12) return false;
      const t = ((r.x - p.x) * e.y - (r.y - p.y) * e.x) / den;
      const u = ((r.x - p.x) * d.y - (r.y - p.y) * d.x) / den;
      return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
    };
    let n = 0;
    m.bonds.forEach((b, i) =>
      m.bonds.slice(i + 1).forEach((o) => {
        if ([o.a, o.b].includes(b.a) || [o.a, o.b].includes(b.b)) return;
        if (cross(at.get(b.a)!, at.get(b.b)!, at.get(o.a)!, at.get(o.b)!)) n++;
      }),
    );
    return n;
  }

  it("has exactly two crossings, in either form and either flip (F8's known answer; which of each two is behind is read once a group carries its depth)", () => {
    for (const flip of [false, true]) {
      for (const form of [0, 1] as const) {
        const d = draw(flip, form);
        const atoms: Atom[] = [...d.atoms];
        const bonds: Bond[] = [...d.bonds];
        d.solid.free.forEach((free, i) => {
          const place = seenPlaces(d, free.at).find((p) => p.free === free)!;
          atoms.push({ id: 50 + i, el: "H", r: 0.9, x: place.place.x, y: place.place.y });
          bonds.push({ id: 200 + i, a: d.ring[free.at], b: 50 + i, order: 1 });
        });
        expect(atoms).toHaveLength(18);
        expect(crossings({ atoms, bonds }), `flip ${flip} form ${form}`).toBe(2);
      }
    }
  });
});
