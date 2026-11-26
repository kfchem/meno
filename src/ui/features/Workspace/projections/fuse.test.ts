import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { chair, fused } from "../../../../lib/chem/perception/projection/solids";
import { drawn } from "../../../../lib/chem/perception/projection/views";
import { cipMarksOf } from "../chem/cipMarks";
import { identityInputOf, identityOfDrawn } from "../chem/identityOf";
import type { Atom, Bond, Model } from "../store/types";
import { chairDrawing, FIRST_FORM, seenPlaces } from "./chair";
import { fusableBonds, fusedOn, type Fuse, type FuseHow } from "./fuse";

const draw = () => chairDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 100 });

/** The chair with a methyl on each (atom, face) given. */
function methylated(groups: [number, 1 | -1][]): Model {
  const d = draw();
  const atoms: Atom[] = [...d.atoms];
  const bonds: Bond[] = [...d.bonds];
  groups.forEach(([k, face], i) => {
    const free = d.solid.free.find((f) => f.at === k && f.face === face)!;
    const place = seenPlaces(d, k).find((p) => p.free === free)!;
    atoms.push({ id: 50 + i, el: "C", r: 0.9, x: place.place.x, y: place.place.y });
    bonds.push({ id: 200 + i, a: d.ring[k], b: 50 + i, order: 1 });
  });
  return { atoms, bonds };
}

const everything = (m: Model) => new Set(m.atoms.map((a) => a.id));
const added = (m: Model, f: Fuse): Model => {
  const ids = f.atoms.map((_, n) => 500 + n);
  const end = (e: { id: number } | { new: number }) => ("id" in e ? e.id : ids[e.new]);
  return {
    atoms: [...m.atoms, ...f.atoms.map((a, n) => ({ ...a, id: ids[n] }))],
    bonds: [...m.bonds, ...f.bonds.map((b, n) => ({ id: 600 + n, a: end(b.a), b: end(b.b), order: 1 as const }))],
  };
};
const fuse = (m: Model, bond: number, how: FuseHow) => {
  const f = fusedOn(m, everything(m), bond, how);
  if (!f || "refused" in f) throw new Error(f ? f.refused : "none");
  return added(m, f);
};

describe("a chair fused on a bond of a chair", () => {
  const bare = methylated([]);
  const trans = { id: 100, how: "trans" as const };

  it("offers the ring's bonds of a chair, and none on a drawing without one", () => {
    expect(fusableBonds(bare, everything(bare)).sort()).toEqual([100, 101, 102, 103, 104, 105]);
    expect(fusableBonds({ atoms: bare.atoms.map((a) => ({ ...a, z: undefined })), bonds: bare.bonds }, everything(bare))).toEqual([]);
  });

  it("adds four atoms and five bonds, ten atoms in two six-rings that share the bond", () => {
    const m = fuse(bare, trans.id, trans.how);
    expect(m.atoms).toHaveLength(10);
    expect(m.bonds).toHaveLength(11);
    expect(m.atoms.slice(6).every((a) => a.z != null && a.stereoCentre === true)).toBe(true);
  });

  it("makes trans- and cis-decalin: two identities, the two cis fusions of a bare chair one compound", () => {
    const t = identityOfDrawn(fuse(bare, 100, "trans")).text;
    const cisUp = identityOfDrawn(fuse(bare, 100, { cis: 1 })).text;
    const cisDown = identityOfDrawn(fuse(bare, 100, { cis: -1 })).text;
    expect(identityOfDrawn(fuse(bare, 100, "trans")).complete).toBe(true);
    expect(t).not.toBe(cisUp);
    expect(cisUp).toBe(cisDown);
  });

  it("makes on a ring with one methyl the two cis fusions at one bond two compounds, and trans a third (cis-syn-cis, cis-anti-cis)", () => {
    const m = methylated([[3, 1]]);
    // (the bond between the atoms 0 and 1, away from the methyl)
    const t = identityOfDrawn(fuse(m, 100, "trans")).text;
    const up = identityOfDrawn(fuse(m, 100, { cis: 1 })).text;
    const down = identityOfDrawn(fuse(m, 100, { cis: -1 })).text;
    expect(new Set([t, up, down]).size).toBe(3);
  });

  it("refuses, in words, a bond whose places a group stands at; none for a bond of no chair", () => {
    // (a methyl on atom 0, on each face: the equatorial place trans takes is held)
    const held = methylated([[0, 1], [0, -1]]);
    const f = fusedOn(held, everything(held), 100, "trans");
    expect(f && "refused" in f).toBe(true);
    expect(fusedOn(bare, everything(bare), 999, "trans")).toBeNull();
  });

  it("draws the new ring's bonds plain, as the first ring's are, each one bond long", () => {
    for (const how of ["trans", { cis: 1 }, { cis: -1 }] as FuseHow[]) {
      const m = fuse(bare, 100, how);
      expect(m.bonds.every((b) => b.display == null)).toBe(true);
      const at = new Map(m.atoms.map((a) => [a.id, a]));
      const ringBond = Math.hypot(at.get(1)!.x - at.get(2)!.x, at.get(1)!.y - at.get(2)!.y);
      for (const b of m.bonds.filter((x) => x.id >= 600)) expect(Math.hypot(at.get(b.a)!.x - at.get(b.b)!.x, at.get(b.a)!.y - at.get(b.b)!.y)).toBeCloseTo(ringBond, 6);
    }
  });

  it("leaves a fused pair - any of the eighteen - neither flipped nor fused again by the tool: it is no one chair of the tool's", async () => {
    const { flipOf } = await import("./flip");
    for (let bond = 100; bond < 106; bond++) {
      for (const how of ["trans", { cis: 1 }, { cis: -1 }] as FuseHow[]) {
        const m = fuse(bare, bond, how);
        expect(flipOf(m, everything(m)), `${bond} ${JSON.stringify(how)}`).toBeNull();
        expect(fusableBonds(m, everything(m)), `${bond} ${JSON.stringify(how)}`).toEqual([]);
      }
    }
  });

  it("draws the new ring at the first ring's own bond length and depth scale, on a chair drawn at another length than the nominal one", async () => {
    const { NOMINAL_BOND_LENGTH: L } = await import("../../../../lib/chem/acs");
    const short = 0.7 * L;
    const d = chairDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 100, length: short });
    const nominal = fuse(bare, 100, "trans");
    const m = fuse({ atoms: d.atoms, bonds: d.bonds }, 100, "trans");
    const at = new Map(m.atoms.map((a) => [a.id, a]));
    for (const b of m.bonds.filter((x) => x.id >= 600)) expect(Math.hypot(at.get(b.a)!.x - at.get(b.b)!.x, at.get(b.a)!.y - at.get(b.b)!.y)).toBeCloseTo(short, 6);
    m.atoms.slice(6).forEach((a, i) => expect(a.z).toBeCloseTo((nominal.atoms[6 + i].z! * short) / L, 6));
  });
});

/** The four pictures of the chair the tool draws: either form, either flip. */
const PICTURES: { form: 0 | 1; flip: boolean }[] = [
  { form: FIRST_FORM, flip: false },
  { form: FIRST_FORM, flip: true },
  { form: 0, flip: false },
  { form: 0, flip: true },
];
const WAYS: FuseHow[] = ["trans", { cis: 1 }, { cis: -1 }];
const named = (how: FuseHow) => (how === "trans" ? "trans" : how.cis === 1 ? "cis, upper face" : "cis, lower face");
const pictured = (p: { form: 0 | 1; flip: boolean }) => chairDrawing({ at: { x: 0, y: 0 }, form: p.form, flip: p.flip, firstId: 1, firstBondId: 100 });

/**
 * Decalin drawn flat by hand, as the reference the fused chairs are read against: two hexagons on a vertical shared bond, an H drawn at each
 * fusion carbon, wedged ("up") or hashed ("down"). One up and one down is trans-decalin; both the same way, cis-decalin.
 */
function flatDecalin(top: "up" | "down", bottom: "up" | "down"): Model {
  const L = NOMINAL_BOND_LENGTH;
  const c = L * Math.cos(Math.PI / 6);
  const places: [number, number, number][] = [
    [1, -2 * c, L / 2], [2, -c, L], [3, 0, L / 2], [4, 0, -L / 2], [5, -c, -L], [6, -2 * c, -L / 2],
    [7, c, L], [8, 2 * c, L / 2], [9, 2 * c, -L / 2], [10, c, -L], [11, 0, 1.3 * L], [12, 0, -1.3 * L],
  ];
  const atoms: Atom[] = places.map(([id, x, y]) => ({ id, el: id > 10 ? "H" : "C", r: 0.9, x, y }));
  const pairs = [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 1], [3, 7], [7, 8], [8, 9], [9, 10], [10, 4]];
  const bonds: Bond[] = pairs.map(([a, b], i) => ({ id: 100 + i, a, b, order: 1 }));
  bonds.push({ id: 120, a: 3, b: 11, order: 1, stereo: top, narrow: 3 }, { id: 121, a: 4, b: 12, order: 1, stereo: bottom, narrow: 4 });
  return { atoms, bonds };
}

describe("trans- and cis-decalin by Fuse: the places the new ring takes, worked from the chair as it is drawn", () => {
  // By hand. On the chair as drawn, an atom's axial bond is vertical; at an "up" atom (its axial points up the page) the axial place is on
  // the upper face and the equatorial one on the lower, at a "down" atom the other way round; the two atoms of a ring bond are one of each.
  // trans: the two ring-fusion hydrogens must be on opposite faces, and only the two axial places of adjacent atoms are (one up, one down),
  // so the hydrogens take them and the new ring's two bonds take the two equatorial places - which point apart, away from the first ring.
  // cis on the upper face: the new ring takes the upper place at each atom - the axial one at the up atom, the equatorial one at the down
  // atom - one bond axial and one equatorial, and the two hydrogens are both on the lower face; cis on the lower face, the mirror of that.
  for (const p of PICTURES) {
    it(`takes them on every ring bond of the chair, form ${p.form}${p.flip ? " flipped" : ""}`, () => {
      const d = pictured(p);
      const m0: Model = { atoms: d.atoms, bonds: d.bonds };
      for (let k = 0; k < 6; k++) {
        const [i, j] = d.solid.bonds[k];
        for (const how of WAYS) {
          const m = fuse(m0, 100 + k, how);
          const at = new Map(m.atoms.map((a) => [a.id, a]));
          const said = `bond ${k}, ${named(how)}`;
          for (const q of [i, j]) {
            const id = d.ring[q];
            const up = seenPlaces(d, q).find((s) => s.free.kind === "axial")!.direction.y > 0;
            const bond = m.bonds.find((b) => b.id >= 600 && (b.a === id || b.b === id))!;
            const other = at.get(bond.a === id ? bond.b : bond.a)!;
            const v = { x: other.x - at.get(id)!.x, y: other.y - at.get(id)!.y };
            const axial = Math.abs(v.x) < 1e-6;
            const wanted = how === "trans" ? "equatorial" : (how.cis === 1) === up ? "axial" : "equatorial";
            expect(axial ? "axial" : "equatorial", said).toBe(wanted);
            // (the new bond goes to the face asked for: the axial one straight up the page on the upper face, down on the lower)
            if (axial) expect(Math.sign(v.y), said).toBe(how === "trans" ? 0 : how.cis);
          }
        }
      }
    });
  }
});

describe("what Meno reads back from a fused chair", () => {
  const trans = identityOfDrawn(flatDecalin("up", "down")).text;
  const cis = identityOfDrawn(flatDecalin("up", "up")).text;

  it("tells the two flat references apart, and reads the two cis drawings, wedges up or hashes down, as one compound", () => {
    expect(trans).not.toBe(cis);
    expect(identityOfDrawn(flatDecalin("down", "down")).text).toBe(cis);
    expect(identityOfDrawn(flatDecalin("down", "up")).text).toBe(trans);
  });

  it("reads trans as trans-decalin and either cis as cis-decalin, on every ring bond, in every picture of the chair", () => {
    for (const p of PICTURES) {
      const d = pictured(p);
      const m0: Model = { atoms: d.atoms, bonds: d.bonds };
      for (let k = 0; k < 6; k++) {
        for (const how of WAYS) {
          const read = identityOfDrawn(fuse(m0, 100 + k, how));
          expect(read.complete).toBe(true);
          expect(read.text, `form ${p.form} flip ${p.flip} bond ${k}, ${named(how)}`).toBe(how === "trans" ? trans : cis);
        }
      }
    }
  });

  it("reads R and S on 1-methyldecalin as worked by hand: the methyl on the ring atom beside a fusion carbon, axial or equatorial", () => {
    // By hand, the first picture of the chair, fused on bond 0 (atoms 0 and 1), the methyl on atom 5 (beside atom 0). Decalin's numbers:
    // atom 5 is C1, atom 0 C8a, atom 1 C4a. CIP ranks (worked by hand): at C1, C8a > C2 > CH3 > H; at C8a, C4a > C1 > C8 > H (C4a and C1
    // tie on (C,C,H) and C4a's branches (C,H,H)(C,H,H) beat C1's (C,H,H)(H,H,H)); at C4a, C8a > C4 > C5 > H (C4 and C5 tie until the third
    // sphere, where C4's path meets C1 (C,C,H) and C5's meets C8 (C,H,H)). The sense of each, from the solid's own atoms and the H on the
    // place the drawing leaves free (seen from opposite the H, the three clockwise is R), by hand from the chair's coordinates:
    const byHand: Record<string, [string, string, string]> = {
      "trans equatorial": ["S", "R", "R"],
      "trans axial": ["R", "R", "R"],
      "cis, upper face equatorial": ["S", "S", "R"],
      "cis, upper face axial": ["R", "S", "R"],
      "cis, lower face equatorial": ["S", "R", "S"],
      "cis, lower face axial": ["R", "R", "S"],
    };
    const d = draw();
    for (const how of WAYS) {
      for (const kind of ["equatorial", "axial"] as const) {
        const m = fuse({ atoms: d.atoms, bonds: d.bonds }, 100, how);
        const place = seenPlaces(d, 5).find((s) => s.free.kind === kind)!;
        m.atoms.push({ id: 50, el: "C", r: 0.9, x: place.place.x, y: place.place.y });
        m.bonds.push({ id: 200, a: d.ring[5], b: 50, order: 1 });
        const marks = cipMarksOf(m);
        expect([d.ring[5], d.ring[0], d.ring[1]].map((id) => marks.centres.get(id)), `${named(how)} ${kind}`).toEqual(byHand[`${named(how)} ${kind}`]);
      }
    }
  });

  it("reads a group at any free place of either ring of every fused pair the way the solid has it (288 drawings)", () => {
    // (the answer is the solid's own: each centre's sense from the chair's coordinates, a group's atom one bond along its free direction;
    //  the drawing's group is put along the direction `drawn` gives it, as the chair's own groups are)
    const d = draw();
    const det = (o: readonly number[], p: (readonly number[])[]) => {
      const v = p.map((x) => [x[0] - o[0], x[1] - o[1], x[2] - o[2]]);
      return v[0][0] * (v[1][1] * v[2][2] - v[1][2] * v[2][1]) - v[0][1] * (v[1][0] * v[2][2] - v[1][2] * v[2][0]) + v[0][2] * (v[1][0] * v[2][1] - v[1][1] * v[2][0]);
    };
    let read = 0;
    for (let k = 0; k < 6; k++) {
      const [i, j] = d.solid.bonds[k];
      for (const how of WAYS) {
        const solid = fused(chair(), k, "chair", how);
        const picture = drawn(solid, FIRST_FORM)!;
        for (let q = 0; q < 10; q++) {
          if (q === i || q === j) continue;
          for (const free of solid.free.filter((f) => f.at === q)) {
            const m = fuse({ atoms: d.atoms, bonds: d.bonds }, 100 + k, how);
            const id = q < 6 ? d.ring[q] : 500 + q - 6;
            const atom = m.atoms.find((a) => a.id === id)!;
            const seen = picture.free.find((f) => f.free === free)!;
            m.atoms.push({ id: 50, el: "C", r: 0.9, x: atom.x + seen.x * NOMINAL_BOND_LENGTH, y: atom.y + seen.y * NOMINAL_BOND_LENGTH });
            m.bonds.push({ id: 200, a: id, b: 50, order: 1 });
            const where = new Map<number, readonly number[]>(d.ring.map((r, s) => [r, solid.atoms[s]]));
            for (let s = 6; s < 10; s++) where.set(500 + s - 6, solid.atoms[s]);
            where.set(50, solid.atoms[q].map((x, n) => x + free.direction[n]));
            const { input } = identityInputOf(m);
            const said = `bond ${k}, ${named(how)}, atom ${q} ${free.kind}`;
            expect(input.atoms[m.atoms.findIndex((a) => a.id === id)].tetra, said).toBeTruthy();
            input.atoms.forEach((a, n) => {
              if (!a.tetra) return;
              const truth = det(where.get(m.atoms[n].id)!, a.tetra.neighbours.slice(0, 3).map((x) => where.get(m.atoms[x].id)!)) > 0 ? 1 : -1;
              expect(a.tetra.volume, `${said}: centre ${m.atoms[n].id}`).toBe(truth);
            });
            read++;
          }
        }
      }
    }
    expect(read).toBe(288);
  });

  it("is a fused pair no tool flips: Flip chair is not offered on any of the eighteen, trans or cis", async () => {
    // (trans-decalin cannot ring-flip at all; cis-decalin can, both rings at once, which the tool does not draw yet)
    const { flipOf } = await import("./flip");
    const d = draw();
    for (let k = 0; k < 6; k++) for (const how of WAYS) expect(flipOf(fuse({ atoms: d.atoms, bonds: d.bonds }, 100 + k, how), new Set([...d.ring, 500, 501, 502, 503]))).toBeNull();
  });
});

describe("how a fused pair is drawn", () => {
  /** Whether two bonds of a drawing cross on the page, away from their ends. */
  const crossing = (m: Model) => {
    const at = new Map(m.atoms.map((a) => [a.id, a]));
    const out: [number, number][] = [];
    for (const p of m.bonds) {
      for (const q of m.bonds) {
        if (p.id >= q.id || [p.a, p.b].some((x) => x === q.a || x === q.b)) continue;
        const [a, b, c, e] = [at.get(p.a)!, at.get(p.b)!, at.get(q.a)!, at.get(q.b)!];
        const side = (u: Atom, v: Atom, w: Atom) => Math.sign((v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x));
        if (side(a, b, c) * side(a, b, e) < 0 && side(c, e, a) * side(c, e, b) < 0) out.push([p.id, q.id]);
      }
    }
    return out;
  };

  it("draws the new ring as a chair of the first's proportions: every bond of the four lines the first ring is drawn on, one bond long", () => {
    const d = draw();
    const lines = (m: Model) => {
      const at = new Map(m.atoms.map((a) => [a.id, a]));
      return new Set(m.bonds.map((b) => Math.round(((Math.atan2(at.get(b.b)!.y - at.get(b.a)!.y, at.get(b.b)!.x - at.get(b.a)!.x) * 180) / Math.PI + 360) % 180)));
    };
    // (the first ring is drawn on three lines; its axial and equatorial places add the vertical: four in all, and no other)
    const first = lines({ atoms: d.atoms, bonds: d.bonds });
    for (let k = 0; k < 6; k++) {
      for (const how of WAYS) {
        const m = fuse({ atoms: d.atoms, bonds: d.bonds }, 100 + k, how);
        expect([...lines(m)].every((l) => first.has(l) || l === 90), `bond ${k}, ${named(how)}`).toBe(true);
      }
    }
  });

  it("draws trans on every bond, and cis on the bonds 0 and 3, with no bond across another; cis on 1 and 2 (upper face) and 4 and 5 (lower) puts the new ring's axial bond in front of the first ring's far bond", () => {
    // (the new ring folds back over the first, as the solid does seen from this side: the far bond is drawn broken behind it, by its depth)
    const d = draw();
    const across = new Set<string>();
    for (let k = 0; k < 6; k++) {
      for (const how of WAYS) if (crossing(fuse({ atoms: d.atoms, bonds: d.bonds }, 100 + k, how)).length) across.add(`${k} ${named(how)}`);
    }
    expect([...across].sort()).toEqual(["1 cis, upper face", "2 cis, upper face", "4 cis, lower face", "5 cis, lower face"]);
  });
});
