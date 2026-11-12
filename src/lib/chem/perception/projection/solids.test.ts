import { describe, expect, it } from "vitest";
import { boat, CHAIR_H, CHAIR_R, chair, distance, dot, ECLIPSED_OFFSET_DEG, ENVELOPE_FLAP, envelope, flipped, fused, halfChair, HALF_CHAIR_OUT, haworth, newman, sub, torsion, unit, cross, length, type FreePosition, type Solid, type V3 } from "./solids";

// Every number here is worked out by hand (bond length 1), the line beside it.

const TETRAHEDRAL = -1 / 3;
const close = (a: number, b: number, digits = 9) => expect(a).toBeCloseTo(b, digits);
const closeV = (a: V3, b: V3, digits = 9) => a.forEach((v, i) => close(v, b[i], digits));
const cosine = (a: V3, b: V3) => dot(unit(a), unit(b));
const deg = (r: number) => (r * 180) / Math.PI;
const freeAt = (s: Solid, k: number) => s.free.filter((f) => f.at === k);
const one = (s: Solid, k: number, kind: FreePosition["kind"]) => freeAt(s, k).find((f) => f.kind === kind)!;
/** The neighbours of atom `k` by the bonds, as directions from it. */
const arms = (s: Solid, k: number): V3[] => s.bonds.flatMap(([a, b]) => (a === k ? [unit(sub(s.atoms[b], s.atoms[k]))] : b === k ? [unit(sub(s.atoms[a], s.atoms[k]))] : []));
/** Every bond is 1, and at every atom the bonds and free positions make the tetrahedral angle: cosine -1/3 for each pair. */
function ideal(s: Solid, digits = 9) {
  for (const [a, b] of s.bonds) close(distance(s.atoms[a], s.atoms[b]), 1, digits);
  s.atoms.forEach((_, k) => {
    const four = [...arms(s, k), ...freeAt(s, k).map((f) => f.direction)];
    for (let i = 0; i < four.length; i++) for (let j = i + 1; j < four.length; j++) close(dot(four[i], four[j]), TETRAHEDRAL, digits);
  });
}

describe("the ideal chair, D3d", () => {
  const c = chair();

  it("has atom k at (R cos 60k, R sin 60k, +h or -h in turn), R = 2 sqrt(2)/3 and h = 1/6", () => {
    close(CHAIR_R, 0.94281, 5);
    close(CHAIR_H, 1 / 6);
    c.atoms.forEach((p, k) => closeV(p, [CHAIR_R * Math.cos((k * Math.PI) / 3), CHAIR_R * Math.sin((k * Math.PI) / 3), k % 2 === 0 ? 1 / 6 : -1 / 6]));
    // (atom 1 by hand: (1/2 * 0.94281, sqrt(3)/2 * 0.94281, -1/6) = (0.47140, 0.81650, -0.16667))
    closeV(c.atoms[1], [0.4714, 0.8165, -0.16667], 4);
  });

  it("closes: adjacent atoms 1 apart (R^2 + (2h)^2 = 8/9 + 1/9), atoms two apart sqrt(8/3) = 1.63299, every ring torsion 60 degrees in turn", () => {
    for (let k = 0; k < 6; k++) {
      close(distance(c.atoms[k], c.atoms[(k + 1) % 6]), 1);
      close(distance(c.atoms[k], c.atoms[(k + 2) % 6]), Math.sqrt(8 / 3));
      const t = deg(torsion(c.atoms[k], c.atoms[(k + 1) % 6], c.atoms[(k + 2) % 6], c.atoms[(k + 3) % 6]));
      close(t, k % 2 === 0 ? -60 : 60, 7);
    }
  });

  it("puts the axial at (0, 0, 1) over an atom above the plane, and the equatorial at (a cos 60k, a sin 60k, -1/3), a = 2 sqrt(2)/3", () => {
    closeV(one(c, 0, "axial").direction, [0, 0, 1]);
    closeV(one(c, 1, "axial").direction, [0, 0, -1]);
    for (let k = 0; k < 6; k++) {
      const eq = one(c, k, "equatorial").direction;
      closeV(eq, [(2 * Math.SQRT2 / 3) * Math.cos((k * Math.PI) / 3), (2 * Math.SQRT2 / 3) * Math.sin((k * Math.PI) / 3), k % 2 === 0 ? -1 / 3 : 1 / 3]);
      close(length(eq), 1);
    }
  });

  it("has at every atom its two ring bonds, its axial and its equatorial at the tetrahedral angle: every pair's cosine -1/3", () => {
    ideal(c);
    expect(c.free).toHaveLength(12);
  });

  it("has every equatorial parallel to the two ring bonds once removed: for atom 0, to the bonds 1-2 and 4-5", () => {
    const eq = one(c, 0, "equatorial").direction;
    for (const [a, b] of [[1, 2], [4, 5]]) close(Math.abs(cosine(eq, sub(c.atoms[b], c.atoms[a]))), 1);
    // (and not to the bond 2-3: that one is 1/3 off)
    expect(Math.abs(cosine(eq, sub(c.atoms[3], c.atoms[2])))).toBeLessThan(0.99);
  });

  it("says the face: an axial at an atom above the plane is the upper face (1), its equatorial the lower (-1); below it, the other way", () => {
    expect([one(c, 0, "axial").face, one(c, 0, "equatorial").face]).toEqual([1, -1]);
    expect([one(c, 1, "axial").face, one(c, 1, "equatorial").face]).toEqual([-1, 1]);
    // (a face is the side of the mean plane its direction leans to)
    for (const f of c.free) expect(Math.sign(f.direction[2])).toBe(f.face);
  });

  it("flips: h to -h; every axial becomes equatorial and the reverse, each group keeping its face (up stays up)", () => {
    const f = flipped(c);
    f.atoms.forEach((p, k) => closeV(p, [c.atoms[k][0], c.atoms[k][1], -c.atoms[k][2]]));
    ideal(f);
    for (const g of c.free) {
      const same = f.free.find((x) => x.at === g.at && x.face === g.face)!;
      expect(same.kind).toBe(g.kind === "axial" ? "equatorial" : "axial");
    }
    // (flipped back, it is the chair)
    flipped(f).atoms.forEach((p, k) => closeV(p, c.atoms[k]));
    expect(() => flipped(haworth(6))).toThrow();
  });

  describe("the substitution patterns that follow, as groups on faces", () => {
    // (two groups on a ring are cis where they stand on one face, trans on two; the chair says which kinds that takes)
    const kinds = (i: number, j: number) => {
      const out: { cis: string[]; trans: string[] } = { cis: [], trans: [] };
      for (const a of freeAt(c, i)) for (const b of freeAt(c, j)) (a.face === b.face ? out.cis : out.trans).push(`${a.kind[0]}${b.kind[0]}`);
      return out;
    };
    it("cis-1,2 one axial and one equatorial; trans-1,2 both axial or both equatorial", () => {
      const k = kinds(0, 1);
      expect(k.cis.sort()).toEqual(["ae", "ea"]);
      expect(k.trans.sort()).toEqual(["aa", "ee"]);
    });
    it("cis-1,3 both the same; trans-1,3 one of each", () => {
      const k = kinds(0, 2);
      expect(k.cis.sort()).toEqual(["aa", "ee"]);
      expect(k.trans.sort()).toEqual(["ae", "ea"]);
    });
    it("cis-1,4 one of each; trans-1,4 both the same", () => {
      const k = kinds(0, 3);
      expect(k.cis.sort()).toEqual(["ae", "ea"]);
      expect(k.trans.sort()).toEqual(["aa", "ee"]);
    });
  });
});

describe("the ideal boat, C2v", () => {
  const b = boat();
  const w = Math.sqrt(8 / 3);

  it("is the six atoms as calculated: every bond 1, every angle 109.471 degrees, the two out-of-plane atoms 5/3 apart", () => {
    const q = Math.SQRT2 / 3;
    const want: V3[] = [[-1 / 3, w / 2, q], [0, 0, 0], [1, 0, 0], [4 / 3, w / 2, q], [1, w, 0], [0, w, 0]];
    b.atoms.forEach((p, k) => closeV(p, want[k]));
    for (let k = 0; k < 6; k++) {
      close(distance(b.atoms[k], b.atoms[(k + 1) % 6]), 1);
      const [u1, u2] = [unit(sub(b.atoms[(k + 5) % 6], b.atoms[k])), unit(sub(b.atoms[(k + 1) % 6], b.atoms[k]))];
      close(deg(Math.acos(dot(u1, u2))), 109.4712206, 6);
    }
    close(distance(b.atoms[0], b.atoms[3]), 5 / 3);
  });

  it("has ring torsions 0, -60, 60, 0, -60, 60 (from the bond 1-2)", () => {
    const t = [1, 2, 3, 4, 5, 0].map((k) => deg(torsion(b.atoms[(k + 5) % 6], b.atoms[k], b.atoms[(k + 1) % 6], b.atoms[(k + 2) % 6])));
    t.forEach((v, i) => close(v, [0, -60, 60, 0, -60, 60][i], 7));
  });

  it("has at every atom the two directions that complete the tetrahedron: every pair's cosine -1/3", () => {
    ideal(b);
    expect(b.free).toHaveLength(12);
  });

  it("names the bowsprit and the flagpole at the out-of-plane atoms - the bowsprit the bond more nearly parallel to the plane of the other four - and up or down elsewhere", () => {
    for (const k of [0, 3]) {
      const bow = one(b, k, "bowsprit").direction;
      const flag = one(b, k, "flagpole").direction;
      expect(Math.abs(bow[2])).toBeLessThan(Math.abs(flag[2]));
      // (the flagpoles of the two stand toward each other, over the ring: 0 and 3 are 5/3 apart and the flagpoles' ends come nearer)
      const ends = [0, 3].map((j) => { const p = b.atoms[j]; const d = one(b, j, "flagpole").direction; return [p[0] + d[0], p[1] + d[1], p[2] + d[2]] as V3; });
      expect(distance(ends[0], ends[1])).toBeLessThan(distance(b.atoms[0], b.atoms[3]));
    }
    for (const k of [1, 2, 4, 5]) expect(freeAt(b, k).map((f) => f.kind).sort()).toEqual(["down", "up"]);
    // (the faces are the sides of the plane of the four atoms: the out-of-plane atoms lie on the axis's side)
    for (const f of b.free) expect(Math.sign(f.direction[2])).toBe(f.face);
    expect(b.atoms[0][2]).toBeGreaterThan(0);
  });
});

describe("the half-chair and the envelope, drawn by convention", () => {
  it("has four contiguous atoms in a plane and the other two on opposite sides of it (Moss: half-chair), every bond 1", () => {
    const h = halfChair();
    [0, 1, 2, 3].forEach((k) => close(h.atoms[k][2], 0));
    close(h.atoms[4][2], HALF_CHAIR_OUT);
    close(h.atoms[5][2], -HALF_CHAIR_OUT);
    for (let k = 0; k < 6; k++) close(distance(h.atoms[k], h.atoms[(k + 1) % 6]), 1);
    // (C2: atom 5 is atom 4 turned half way round the y axis)
    closeV(h.atoms[5], [-h.atoms[4][0], h.atoms[4][1], -h.atoms[4][2]]);
  });

  it("names its free positions at the allylic atoms pseudo-axial and pseudo-equatorial, and axial and equatorial at the others", () => {
    const h = halfChair();
    for (const k of [0, 3]) expect(freeAt(h, k).map((f) => f.kind).sort()).toEqual(["pseudo-axial", "pseudo-equatorial"]);
    for (const k of [4, 5]) expect(freeAt(h, k).map((f) => f.kind).sort()).toEqual(["axial", "equatorial"]);
    // (the double bond's atoms, 1 and 2, have one each, in the plane and pointing out: opposite the bisector of the two ring bonds, 120 degrees from each)
    for (const k of [1, 2]) {
      const [only] = freeAt(h, k);
      expect(freeAt(h, k)).toHaveLength(1);
      expect(only.kind).toBe("in-plane");
      close(only.direction[2], 0);
      for (const u of arms(h, k)) close(dot(only.direction, u), -0.5);
    }
    // (the axial one the steeper: nearer the normal)
    for (const k of [0, 3, 4, 5]) {
      const [x, y] = freeAt(h, k).sort((p, q) => (p.kind.endsWith("axial") ? -1 : 1) - (q.kind.endsWith("axial") ? -1 : 1));
      expect(Math.abs(x.direction[2])).toBeGreaterThan(Math.abs(y.direction[2]));
    }
  });

  it("has an envelope: four atoms coplanar, the flap out of the plane (Moss: envelope conformation), every bond 1, Cs", () => {
    const e = envelope();
    [1, 2, 3, 4].forEach((k) => close(e.atoms[k][2], 0));
    close(e.atoms[0][2], ENVELOPE_FLAP);
    for (let k = 0; k < 5; k++) close(distance(e.atoms[k], e.atoms[(k + 1) % 5]), 1);
    // (the mirror plane x = 0 swaps atoms 1 and 4, 2 and 3)
    closeV(e.atoms[4], [-e.atoms[1][0], e.atoms[1][1], e.atoms[1][2]]);
    closeV(e.atoms[3], [-e.atoms[2][0], e.atoms[2][1], e.atoms[2][2]]);
    expect(e.free).toHaveLength(10);
  });
});

describe("the Haworth ring", () => {
  it("is a regular planar ring of six, bond length 1, clockwise from above from the ring O at the back right: C1 at the right", () => {
    const h = haworth(6);
    // (the corners of a regular hexagon of side 1 lie on a circle of radius 1)
    const want = [60, 0, -60, -120, 180, 120].map((a): V3 => [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180), 0]);
    h.atoms.forEach((p, k) => closeV(p, want[k]));
    for (let k = 0; k < 6; k++) close(distance(h.atoms[k], h.atoms[(k + 1) % 6]), 1);
    expect(h.axis).toEqual([0, 0, 1]);
  });

  it("is a regular planar ring of five, the O at the back and C1 at the right", () => {
    const h = haworth(5);
    const r = 1 / (2 * Math.sin(Math.PI / 5));
    close(r, 0.85065, 5);
    const want = [90, 18, -54, -126, 162].map((a): V3 => [r * Math.cos((a * Math.PI) / 180), r * Math.sin((a * Math.PI) / 180), 0]);
    h.atoms.forEach((p, k) => closeV(p, want[k]));
    for (let k = 0; k < 5; k++) close(distance(h.atoms[k], h.atoms[(k + 1) % 5]), 1);
  });

  it("has at each atom two free positions, up (+axis) and down (-axis)", () => {
    for (const n of [5, 6] as const) {
      const h = haworth(n);
      expect(h.free).toHaveLength(2 * n);
      h.atoms.forEach((_, k) => {
        expect(freeAt(h, k).map((f) => [f.kind, f.face, ...f.direction])).toEqual([["up", 1, 0, 0, 1], ["down", -1, 0, 0, -1]]);
      });
    }
  });
});

describe("the Newman pair", () => {
  const stag = newman("staggered");
  const page = (f: FreePosition) => ((deg(Math.atan2(f.direction[1], f.direction[0])) % 360) + 360) % 360;

  it("has two atoms on the line of sight, 1 apart, the front the nearer", () => {
    expect(stag.atoms).toEqual([[0, 0, 0.5], [0, 0, -0.5]]);
    expect(stag.bonds).toEqual([[0, 1]]);
    expect(stag.axis).toEqual([0, 0, 1]);
  });

  it("has three free directions on each at the tetrahedral angle with the central bond: cosine -1/3", () => {
    ideal(stag);
    expect(freeAt(stag, 0)).toHaveLength(3);
    expect(freeAt(stag, 1)).toHaveLength(3);
    // (front: away from the back atom, z = +1/3; back: z = -1/3)
    for (const f of freeAt(stag, 0)) close(f.direction[2], 1 / 3);
    for (const f of freeAt(stag, 1)) close(f.direction[2], -1 / 3);
  });

  it("is staggered on the page: the front at 90, 210 and 330 degrees, the back at 30, 150 and 270", () => {
    expect(freeAt(stag, 0).map(page).map(Math.round)).toEqual([90, 210, 330]);
    expect(freeAt(stag, 1).map(page).map(Math.round)).toEqual([30, 150, 270]);
  });

  it("is eclipsed with the back set turned from the front's by a small angle, counter-clockwise, so that both show", () => {
    const e = newman("eclipsed");
    expect(ECLIPSED_OFFSET_DEG).toBeGreaterThan(0);
    expect(ECLIPSED_OFFSET_DEG).toBeLessThan(30);
    freeAt(e, 1).forEach((f, k) => close(page(f), page(freeAt(e, 0)[k]) + ECLIPSED_OFFSET_DEG, 7));
    ideal(e);
  });
});

describe("rings fused on a chair", () => {
  const c = chair();
  /** The ring-fusion hydrogens - the free positions left at the atoms that have three bonds - and the axial/equatorial kind they keep. */
  const fusionH = (s: Solid) => s.atoms.flatMap((_, k) => (arms(s, k).length === 3 ? freeAt(s, k).map((f) => ({ ...f })) : []));

  it("makes trans-decalin: every bond 1 and every angle tetrahedral to 1e-9, the two fusion hydrogens axial on opposite faces", () => {
    const d = fused(c, 0, "chair", "trans");
    expect(d.atoms).toHaveLength(10);
    expect(d.bonds).toHaveLength(11);
    ideal(d, 9);
    const h = fusionH(d);
    expect(h).toHaveLength(2);
    expect(h.map((x) => x.kind)).toEqual(["axial", "axial"]);
    expect(h[0].face).toBe(-h[1].face);
    // (the far atoms of the new ring at the chair's 1,4 distance from the shared bond's atoms: sqrt(33)/3 = 1.91485)
    close(distance(d.atoms[0], d.atoms[8]), Math.sqrt(33) / 3);
    close(distance(d.atoms[1], d.atoms[9]), Math.sqrt(33) / 3);
    // (and no two atoms on one point: the new ring lies clear of the first)
    for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) expect(distance(d.atoms[i], d.atoms[j])).toBeGreaterThan(0.99);
  });

  it("makes cis-decalin on the face named: exact, the two fusion hydrogens on one face - the other one for the other face", () => {
    for (const face of [1, -1] as const) {
      const d = fused(c, 0, "chair", { cis: face });
      ideal(d, 9);
      const h = fusionH(d);
      expect(h).toHaveLength(2);
      // (the groups the new ring took are on `face`, so the hydrogens are on the other)
      expect(h.map((x) => x.face)).toEqual([-face, -face]);
      expect(h.map((x) => x.kind).sort()).toEqual(["axial", "equatorial"]);
    }
  });

  it("makes the two cis fusions on a ring bearing a group two different solids: they are mirror conformers only on a bare chair", () => {
    const up = fused(c, 0, "chair", { cis: 1 });
    const down = fused(c, 0, "chair", { cis: -1 });
    // (the new ring lies on the other side of the first's mean plane)
    const side = (d: Solid) => Math.sign(d.atoms[7][2] + d.atoms[8][2] - (d.atoms[0][2] + d.atoms[1][2]));
    expect(side(up)).toBe(-side(down));
    // (a methyl axial on atom 4, up: the two fused rings stand on one side of it or the other - cis to it, or trans)
    const methyl = c.free.find((f) => f.at === 4 && f.kind === "axial")!;
    const reach = (d: Solid) => distance(d.atoms[8], [d.atoms[4][0] + methyl.direction[0], d.atoms[4][1] + methyl.direction[1], d.atoms[4][2] + methyl.direction[2]]);
    expect(Math.abs(reach(up) - reach(down))).toBeGreaterThan(0.1);
  });

  /** Which side of ring B's mean plane a fusion hydrogen is on, B being the six atoms in `ring` order (the plane through atoms 0, 2, 4 is parallel to the mean plane). */
  const sideOf = (s: Solid, ring: number[], atom: number) => {
    const p = ring.map((k) => s.atoms[k]);
    const normal = unit(cross(sub(p[2], p[0]), sub(p[4], p[0])));
    const keep = s.free.filter((f) => f.at === atom)[0].direction;
    return Math.sign(dot(keep, normal));
  };

  it("makes perhydrophenanthrene from two trans fusions on a bond beside the first, trans-anti-trans: every bond 1, every angle tetrahedral, the fusion hydrogens of a methylene's two sides on opposite sides", () => {
    const decalin = fused(c, 0, "chair", "trans");
    // (ring B's bond x2-y: atoms 7 and 8)
    const p = fused(decalin, decalin.bonds.findIndex(([a, b]) => a === 7 && b === 8), "chair", "trans");
    expect(p.atoms).toHaveLength(14);
    ideal(p, 8);
    // (ring B is 0-based: the first ring's atoms 0, 1 shared; B = [0, 1, 7, 8, 9, 6]... by the bonds)
    const b = [0, 1, 7, 8, 9, 6];
    expect(p.bonds.filter(([x, y]) => b.includes(x) && b.includes(y))).toHaveLength(6);
    // (the fusion H's across the methylene between them: atoms 1 and 7's: 1 (A/B) and 7 (B/C) are neighbours on ring B)
    expect(sideOf(p, b, 1) * sideOf(p, b, 7)).toBe(-1);
  });

  it("makes perhydroanthracene from two trans fusions on the opposite bond: trans-syn-trans, the one whose middle ring is a chair", () => {
    const decalin = fused(c, 0, "chair", "trans");
    const opposite = decalin.bonds.findIndex(([a, b]) => a === 8 && b === 9);
    const a = fused(decalin, opposite, "chair", "trans");
    ideal(a, 8);
    const b = [0, 1, 7, 8, 9, 6];
    // (the fusion H's of the A/B fusion at atom 1 and of the B/C fusion at atom 8, neighbours across the methylene 7: on one face - syn)
    expect(sideOf(a, b, 1) * sideOf(a, b, 8)).toBe(1);
  });

  it("keeps a five-ring fused onto a chair open and says how far: the closing bond comes out 1.501 long, missing 1 by 0.501, never hidden", () => {
    const m = fused(c, 0, "envelope", "trans");
    close(m.miss!, 0.501, 3);
    expect(fused(c, 0, "envelope", { cis: 1 }).miss).toBeGreaterThan(0.4);
    expect(c.miss).toBeUndefined();
    // (every other bond is 1 and the ring is five atoms)
    expect(m.atoms).toHaveLength(9);
    const lengths = m.bonds.map(([a, b]) => distance(m.atoms[a], m.atoms[b])).sort((x, y) => y - x);
    close(lengths[0], 1.501, 3);
    expect(lengths.slice(1).every((v) => Math.abs(v - 1) < 1e-9)).toBe(true);
  });

  describe("the faces of a fused ring's own atoms, signed as the first ring signs them", () => {
    /** Every free position's face is the side of the axis its direction leans to, in a system whose rings all share the axis. */
    const faces = (d: Solid) => {
      for (const f of d.free) expect(Math.sign(f.direction[2])).toBe(f.face);
    };
    const bondOf = (d: Solid, a: number, b: number) => d.bonds.findIndex(([x, y]) => x === a && y === b);

    it("in trans-decalin, trans-syn-trans perhydroanthracene and trans-anti-trans perhydrophenanthrene: face 1 points up the axis, every one", () => {
      const t = fused(c, 0, "chair", "trans");
      faces(t);
      expect(t.free).toHaveLength(10 + 8);
      faces(fused(t, bondOf(t, 8, 9), "chair", "trans"));
      faces(fused(t, bondOf(t, 7, 8), "chair", "trans"));
    });

    it("in each cis-decalin, the fusion hydrogens are on the face the first ring gives them as the new ring's own labels see them", () => {
      for (const face of [1, -1] as const) {
        const d = fused(c, 0, "chair", { cis: face });
        const ring = [0, 1, 7, 8, 9, 6];
        const p = ring.map((k) => d.atoms[k]);
        const n = unit(cross(sub(p[2], p[0]), sub(p[4], p[0])));
        // (the new ring's labelled up: the side its own positions that say face 1 lean to)
        const own = d.free.filter((f) => f.at >= 6);
        const up = Math.sign(dot(own[0].direction, n)) * own[0].face;
        for (const f of own) expect(Math.sign(dot(f.direction, n)) * up).toBe(f.face);
        for (const h of d.free.filter((f) => f.at < 6 && arms(d, f.at).length === 3)) expect(Math.sign(dot(h.direction, n)) * up).toBe(h.face);
      }
    });

    it("a third ring fused cis on face 1 onto trans-decalin's new ring leaves on the upper side of the whole, face -1 on the lower", () => {
      const t = fused(c, 0, "chair", "trans");
      const bond = bondOf(t, 7, 8);
      for (const face of [1, -1] as const) {
        const three = fused(t, bond, "chair", { cis: face });
        const added = three.atoms.slice(10);
        const mean = added.reduce((sum, p) => sum + p[2], 0) / added.length;
        const base = t.atoms.reduce((sum, p) => sum + p[2], 0) / t.atoms.length;
        expect(Math.sign(mean - base)).toBe(face);
      }
    });
  });

  it("refuses what it does not build: a boat, a bond that is not a chair's ring bond", () => {
    expect(() => fused(c, 0, "boat", "trans")).toThrow();
    expect(() => fused(haworth(6), 0, "chair", "trans")).toThrow();
  });
});
