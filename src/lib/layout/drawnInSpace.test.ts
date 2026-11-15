/**
 * Centres of a drawing with depth read in space (docs/EDITOR-2D.md, *Drawn in
 * perspective*): a chair, a Haworth ring, a Newman projection - as a
 * perspective drawing is, its ring atoms with a depth, its groups with none,
 * each taking the free direction it is drawn nearer to - against the
 * compounds' known configurations.
 */
import { describe, expect, it } from "vitest";
import { groupDepths, readStereo, sameConfiguration, unreadWhy, wedgesForFlat, type DrawnAtom, type DrawnBond } from "./drawn";
import { identity, type IdentityInput } from "../chem/identity";
import { fromSmiles } from "./testdata/fromSmiles";
import { chair, haworth, newman, rad } from "./testdata/projections";
import { cipLabels } from "../chem/cip";
import { cipInput } from "../chem/cip/testdata/cipFrom";
import { chair as chairSolid, fused, cross, dot, sub, type Solid, type V3 } from "../chem/perception/projection/solids";
import { drawn, fromAbove, project, seen, standardView } from "../chem/perception/projection/views";
import { measured } from "../../testing/timeouts";

/** A drawing as identity reads it: its atoms, bonds and the configurations `readStereo` finds. */
function identityOfDrawing(d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }): string {
  const stereo = readStereo(d.atoms, d.bonds);
  const input: IdentityInput = {
    atoms: d.atoms.map((a, i) => ({ el: a.el ?? "C", hs: a.hs, ...(stereo.tetra.get(i) ? { tetra: stereo.tetra.get(i)! } : {}) })),
    bonds: d.bonds.map((b) => ({ a: b.a, b: b.b, order: b.order })),
  };
  return identity(input).text;
}

const smiles = (s: string) => identity(fromSmiles(s)).text;

describe("a chair, read in space", () => {
  // trans-1,2-dimethylcyclohexane: (1R,2R) and (1S,2S) - a chiral pair; cis: meso
  const trans = [smiles("C[C@@H]1CCCC[C@H]1C"), smiles("C[C@H]1CCCC[C@@H]1C")];
  const cis = smiles("C[C@@H]1CCCC[C@@H]1C");

  it("reads trans-1,2-dimethylcyclohexane, diequatorial and diaxial (the ring flipped), as the one compound it is - one of its two enantiomers, whatever the tilt", () => {
    expect(trans[0]).not.toBe(trans[1]);
    for (const tilt of [60, 70, 80]) {
      const eq = identityOfDrawing(chair({ 0: "equatorial", 1: "equatorial" }, tilt));
      const ax = identityOfDrawing(chair({ 0: "axial", 1: "axial" }, tilt));
      expect(trans, `tilt ${tilt}`).toContain(eq);
      expect(trans, `tilt ${tilt}`).toContain(ax);
    }
  });

  it("reads cis-1,2-dimethylcyclohexane, one axial and one equatorial either way round, as the meso compound", () => {
    for (const tilt of [60, 70, 80]) {
      expect(identityOfDrawing(chair({ 0: "axial", 1: "equatorial" }, tilt)), `tilt ${tilt}`).toBe(cis);
      expect(identityOfDrawing(chair({ 0: "equatorial", 1: "axial" }, tilt)), `tilt ${tilt}`).toBe(cis);
    }
  });
});

describe("a chair of (-)-menthol, read in space", () => {
  // CC(C)[C@@H]1CC[C@@H](C)C[C@H]1O is (1R,2S,5R), all three groups equatorial; its mirror image the other way round on all
  const menthol = smiles("CC(C)[C@@H]1CC[C@@H](C)C[C@H]1O");
  const mirrorImage = smiles("CC(C)[C@H]1CC[C@H](C)C[C@@H]1O");
  // (ring atoms 0 to 5 are C1 (OH), C2 (isopropyl), C3, C4, C5 (methyl), C6)
  const equatorial = { 0: { place: "equatorial" as const, el: "O", hs: 1 }, 1: { place: "equatorial" as const, hs: 1, branches: 2 }, 4: "equatorial" as const };

  it("with all three groups equatorial is menthol or its mirror image, turned over it is the same compound, and mirrored in the page with its depth kept it is the mirror image", () => {
    expect(menthol).not.toBe(mirrorImage);
    for (const tilt of [60, 70, 80]) {
      const seen = identityOfDrawing(chair(equatorial, tilt));
      expect([menthol, mirrorImage], `tilt ${tilt}`).toContain(seen);
      expect(identityOfDrawing(chair(equatorial, tilt, "turned over")), `tilt ${tilt}, turned over`).toBe(seen);
      // (the page mirrored with the depth kept: the mirror image)
      expect(identityOfDrawing(chair(equatorial, tilt, "mirrored")), `tilt ${tilt}, mirrored`).toBe(seen === menthol ? mirrorImage : menthol);
    }
  });

  it("with all three groups axial (the ring flipped) is the same compound as all three equatorial", () => {
    const flipped = { 0: { ...equatorial[0], place: "axial" as const }, 1: { ...equatorial[1], place: "axial" as const }, 4: "axial" as const };
    // (a ring flip turns every equatorial to axial and keeps the compound: atoms of the ring change their up and down, the drawing's ring the same)
    for (const tilt of [60, 70, 80]) expect([menthol, mirrorImage]).toContain(identityOfDrawing(chair(flipped, tilt)));
  });

  it("with the hydroxyl axial is another diastereomer (neomenthol's ring flipped: not menthol, not its mirror image)", () => {
    const other = identityOfDrawing(chair({ ...equatorial, 0: { ...equatorial[0], place: "axial" as const } }, 70));
    expect([menthol, mirrorImage]).not.toContain(other);
  });
});

describe("a Haworth ring, read in space", () => {
  // D-glucopyranose, from PubChem's SMILES: beta (OH at C1 up, McNaught 1996, 2-Carb-6.2: the anomeric O trans to the O of C5 in the Fischer projection) and alpha
  const beta = "C([C@@H]1[C@H]([C@@H]([C@H]([C@@H](O1)O)O)O)O)O";
  const alpha = "C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O)O)O)O)O";

  it("is beta-D-glucopyranose by Meno's own labels: C1 R, C2 R, C3 S, C4 S, C5 R (the alpha anomer: C1 S)", () => {
    // (the ring's carbons in the SMILES' order: C5, C4, C3, C2, C1 are atoms 1 to 5)
    const labelsOf = (smi: string) => Object.fromEntries([...cipLabels(cipInput(smi)).centres].map(([a, x]) => [a, "label" in x ? x.label : "?"]));
    expect(labelsOf(beta)).toEqual({ 1: "R", 2: "S", 3: "S", 4: "R", 5: "R" });
    expect(labelsOf(alpha)).toEqual({ 1: "R", 2: "S", 3: "S", 4: "R", 5: "S" });
  });

  it("reads beta-D-glucopyranose - OH up at C1, down at C2, up at C3, down at C4, CH2OH up at C5 - as its SMILES, and the alpha anomer as the other structure", () => {
    expect(smiles(beta)).not.toBe(smiles(alpha));
    expect(identityOfDrawing(haworth([true, false, true, false, true]))).toBe(smiles(beta));
    expect(identityOfDrawing(haworth([false, false, true, false, true]))).toBe(smiles(alpha));
  });
});

describe("a Newman projection, read in space", () => {
  const labelled = (smi: string) =>
    [...cipLabels(cipInput(smi)).centres]
      .map(([, x]) => ("label" in x ? x.label : "?"))
      .sort()
      .join("");
  const forms = ["C[C@H](Br)[C@H](Br)C", "C[C@H](Br)[C@@H](Br)C", "C[C@@H](Br)[C@H](Br)C", "C[C@@H](Br)[C@@H](Br)C"];
  const meso = forms.find((f) => labelled(f) === "RS")!;
  const chiral = [...new Set(forms.filter((f) => ["RR", "SS"].includes(labelled(f))).map(smiles))];

  it("is told from the SMILES' labels: one meso form and two enantiomers", () => {
    expect(meso).toBeDefined();
    expect(chiral).toHaveLength(2);
  });

  it("reads the staggered projection with both methyls anti and both bromines anti as the meso compound, and the back atom's groups turned together by 120 degrees as the same", () => {
    // (front: CH3 up, Br lower left; back: CH3 down, Br upper right - each anti to its like)
    for (const turn of [0, 120, 240]) {
      const d = newman({ methyl: 90, bromine: 210 }, { methyl: 270 + turn, bromine: 30 + turn });
      expect(identityOfDrawing(d), `turned by ${turn}`).toBe(smiles(meso));
    }
  });

  it("reads the two bromines gauche with the methyls anti as one of the two enantiomers, and exchanging two groups of one atom as the other diastereomer", () => {
    const chiralDrawn = identityOfDrawing(newman({ methyl: 90, bromine: 210 }, { methyl: 270, bromine: 150 }));
    expect(chiral).toContain(chiralDrawn);
    // (the back atom's methyl and bromine exchanged: the meso)
    const exchanged = identityOfDrawing(newman({ methyl: 90, bromine: 210 }, { methyl: 150, bromine: 270 }));
    expect(exchanged).not.toBe(chiralDrawn);
  });

  it("reads the eclipsed projection too, and the mirror image of the staggered one as the other enantiomer", () => {
    const a = identityOfDrawing(newman({ methyl: 90, bromine: 210 }, { methyl: 270, bromine: 150 }));
    const b = identityOfDrawing(newman({ methyl: 90, bromine: 330 }, { methyl: 270, bromine: 30 }));
    expect([a, b].sort()).toEqual([...chiral].sort());
  });

  it("reads the same configuration whichever of its bonds is listed first - the groups' own directions, not only the bond behind, are right", () => {
    // (a front atom with three groups of its own, the bond to the atom behind it listed last or first: the same configuration)
    const front = (bondBehindFirst: boolean) => {
      const atoms: DrawnAtom[] = [
        { x: 0, y: 0, z: 1, hs: 0, centre: true },
        { x: 0, y: 0, z: 0, hs: 3, centre: true },
        { x: 0, y: 1.6, el: "C", hs: 3 },
        { x: -1.4, y: -0.8, el: "Br", hs: 0 },
        { x: 1.4, y: -0.8, el: "Cl", hs: 0 },
      ];
      const behind: DrawnBond = { a: 0, b: 1, order: 1 };
      const own: DrawnBond[] = [2, 3, 4].map((b) => ({ a: 0, b, order: 1 }));
      const bonds = bondBehindFirst ? [behind, ...own] : [...own, behind];
      return readStereo(atoms, bonds).tetra.get(0)!;
    };
    expect(sameConfiguration(front(true), front(false))).toBe(true);
    // (and the groups drawn the other way round are the other configuration)
    const mirrored = { ...front(false), volume: (-front(false).volume) as 1 | -1 };
    expect(sameConfiguration(front(true), mirrored)).toBe(false);
  });

  it("reads nothing at an atom whose two groups are drawn on one line", () => {
    const d = newman({ methyl: 90, bromine: 100 }, { methyl: 270, bromine: 30 });
    expect(readStereo(d.atoms, d.bonds).tetra.has(0)).toBe(false);
  });
});

describe("a group drawn between two free positions", () => {
  /** The chair's ring atom 0 with its methyl drawn `turn` degrees from the bisector of the axial and equatorial ways, as seen. */
  function between(turn: number) {
    const ax = chair({ 0: "axial" });
    const eq = chair({ 0: "equatorial" });
    const at = ax.atoms[0];
    const [a, e] = [ax.atoms[6], eq.atoms[6]].map((g) => ({ x: g.x - at.x, y: g.y - at.y }));
    const mid = Math.atan2(Math.sin(Math.atan2(a.y, a.x)) + Math.sin(Math.atan2(e.y, e.x)), Math.cos(Math.atan2(a.y, a.x)) + Math.cos(Math.atan2(e.y, e.x))) + rad(turn);
    const d = chair({ 0: "axial" });
    d.atoms[6] = { x: at.x + 1.5 * Math.cos(mid), y: at.y + 1.5 * Math.sin(mid), hs: 3 };
    return { d, apartSeen: (Math.abs(Math.atan2(Math.sin(Math.atan2(a.y, a.x) - Math.atan2(e.y, e.x)), Math.cos(Math.atan2(a.y, a.x) - Math.atan2(e.y, e.x)))) * 180) / Math.PI };
  }

  it("is read nowhere near half way: a group drawn 20 degrees from the bisector says its way, either side", () => {
    expect(between(0).apartSeen).toBeGreaterThan(2 * 12);
    for (const turn of [-20, 20]) {
      const { d } = between(turn);
      expect(readStereo(d.atoms, d.bonds).tetra.has(0), `turned ${turn}`).toBe(true);
    }
  });

  it("is unread at that centre within 12 degrees of the bisector, whichever side - and its other centres are read", () => {
    for (const turn of [0, -11, 11]) {
      const { d } = between(turn);
      expect(readStereo(d.atoms, d.bonds).tetra.has(0), `turned ${turn}`).toBe(false);
    }
  });

  it("says why, in the words a wedge's unread centre has: its bond is drawn between its two free positions", () => {
    const { d } = between(0);
    expect(readStereo(d.atoms, d.bonds).tetra.has(0)).toBe(false);
    expect(unreadWhy(d.atoms, d.bonds, 0)).toBe("its bond is drawn between its two free positions");
  });

  it("is the axial way and the equatorial one told apart by the two sides of it", () => {
    const a = readStereo(chair({ 0: "axial" }).atoms, chair({ 0: "axial" }).bonds).tetra.get(0)!;
    const e = readStereo(chair({ 0: "equatorial" }).atoms, chair({ 0: "equatorial" }).bonds).tetra.get(0)!;
    expect(a.volume).toBe(-e.volume);
  });
});

/** A drawing as a reader that knows only wedges has it (`wedgesForFlat`): no depth, the wedges and the H atoms it adds, read flat. */
function flatCopy(d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }): { atoms: DrawnAtom[]; bonds: DrawnBond[] } {
  const atoms = d.atoms.map(({ z: _z, centre: _c, ...a }) => ({ ...a }));
  const bonds = d.bonds.map((b) => ({ ...b }));
  const { wedges, hydrogens } = wedgesForFlat(d.atoms, d.bonds);
  const hydrogenOn = new Map<number, number>();
  for (const h of hydrogens) {
    atoms.push({ x: h.at.x, y: h.at.y, el: "H", hs: 0 });
    atoms[h.on] = { ...atoms[h.on], hs: atoms[h.on].hs - 1 };
    bonds.push({ a: h.on, b: atoms.length - 1, order: 1 });
    hydrogenOn.set(h.on, atoms.length - 1);
  }
  for (const w of wedges) {
    const to = w.to === -1 ? hydrogenOn.get(w.from)! : w.to;
    const bond = bonds.find((b) => (b.a === w.from && b.b === to) || (b.b === w.from && b.a === to))!;
    bond.wedge = { narrow: w.from, stereo: w.stereo };
  }
  return { atoms, bonds };
}

describe("a drawing in perspective, said to a reader that knows only wedges", () => {
  it("is the same compound read flat: a chair, a Haworth ring, a Newman projection", () => {
    const drawings = {
      "a chair of menthol": chair({ 0: { place: "equatorial", el: "O", hs: 1 }, 1: { place: "equatorial", hs: 1, branches: 2 }, 4: "equatorial" }),
      "a diaxial chair": chair({ 0: "axial", 1: "axial" }),
      "beta-D-glucopyranose in Haworth's ring": haworth([true, false, true, false, true]),
      "alpha-D-glucopyranose in Haworth's ring": haworth([false, false, true, false, true]),
      "a staggered Newman projection": newman({ methyl: 90, bromine: 210 }, { methyl: 270, bromine: 150 }),
      "the meso Newman projection": newman({ methyl: 90, bromine: 210 }, { methyl: 270, bromine: 30 }),
    };
    for (const [name, d] of Object.entries(drawings)) {
      const space = identityOfDrawing(d);
      expect(identityOfDrawing(flatCopy(d)), name).toBe(space);
    }
  });
});

describe("a wavy bond out of a centre of a drawing in perspective", () => {
  it("leaves that centre open, and its other centres are read: a Haworth glucopyranose with a wavy bond at C1 has C1 open and C2 to C5 read", () => {
    const d = haworth([true, false, true, false, true]);
    const own = (i: number) => readStereo(d.atoms, d.bonds).tetra.has(i);
    expect([1, 2, 3, 4, 5].map(own)).toEqual([true, true, true, true, true]);
    // (the bond from C1 to its OH - the first group atom is atom 6 - drawn wavy: C1 says neither)
    const wavy = { atoms: d.atoms, bonds: d.bonds.map((b) => (b.a === 1 && b.b === 6 ? { ...b, either: true } : b)) };
    const read = readStereo(wavy.atoms, wavy.bonds).tetra;
    expect([1, 2, 3, 4, 5].map((i) => read.has(i))).toEqual([false, true, true, true, true]);
  });
});

describe("chairs fused, read from their ring bonds with depth (not through the engine's solid for a cage)", () => {
  // trans-decalin and both cis-decalins, as their solids are seen from above: every ring atom with its depth, a group (no depth) on each free position in turn,
  // its configuration read and set against the solid's own: the sign of the volume of the atom's first three bonds, as the page's view turns the solid.
  const sides: ("trans" | { cis: 1 | -1 })[] = ["trans", { cis: 1 }, { cis: -1 }];
  for (const how of sides) {
    it(`reads every group of ${how === "trans" ? "trans" : `cis (${(how as { cis: number }).cis})`}-decalin as the solid has it, at every depth scale, turned`, () => {
      const solid = fused(chairSolid(), 0, "chair", how);
      let tried = 0;
      for (const depthScale of [0.5, 1, 2]) {
        for (const turn of [0, 20]) {
          const view = fromAbove(25, turn);
          const spot = seen(solid, view);
          solid.free.forEach((free) => {
            const ringBonds = solid.bonds.filter(([a, b]) => a === free.at || b === free.at).map(([a, b]) => (a === free.at ? b : a));
            // (an atom of two ring bonds: a fusion atom has three, and its free position is its ring-fusion H's)
            if (ringBonds.length !== 2) return;
            const atoms: DrawnAtom[] = spot.map((p, i) => ({ x: 40 * p.x, y: 40 * p.y, z: 40 * depthScale * p.z, hs: ringBonds.length === 2 && i === free.at ? 1 : 0, el: "C", centre: true }));
            atoms.forEach((a, i) => {
              if (i !== free.at) a.hs = solid.bonds.filter(([p, q]) => p === i || q === i).length === 2 ? 2 : 1;
            });
            const g = project(view, free.direction);
            atoms.push({ x: atoms[free.at].x + 40 * g.x, y: atoms[free.at].y + 40 * g.y, hs: 3, el: "C" });
            const bonds: DrawnBond[] = [...solid.bonds.map(([a, b]) => ({ a, b, order: 1 as const })), { a: free.at, b: atoms.length - 1, order: 1 as const }];
            const around = [...ringBonds, atoms.length - 1];
            // (the volume of the first three bonds at the atom, as the solid has it, seen through the same view: its sign)
            const dirs = around.map((n): V3 => (n === atoms.length - 1 ? free.direction : sub(solid.atoms[n], solid.atoms[free.at])));
            const truth = Math.sign(dot(dirs[0], cross(dirs[1], dirs[2])));
            const got = readStereo(atoms, bonds).tetra.get(free.at);
            const neighbours = bonds.flatMap((b) => (b.a === free.at ? [b.b] : b.b === free.at ? [b.a] : []));
            expect(got, `${free.at} ${free.kind} ${depthScale} ${turn}`).toBeDefined();
            // (its neighbours in the order of its bonds: the reading's own order, so its volume is compared as it says it)
            const order = got!.neighbours.filter((n) => n !== -1);
            const asked = order.map((n): V3 => (n === atoms.length - 1 ? free.direction : sub(solid.atoms[n], solid.atoms[free.at])));
            const volume = Math.sign(dot(asked[0], cross(asked[1], asked[2])));
            expect(got!.volume, `${free.at} ${free.kind} ${depthScale} ${turn} ${neighbours}`).toBe(volume);
            expect(truth).not.toBe(0);
            tried++;
          });
        }
      }
      expect(tried).toBeGreaterThan(40);
    });
  }
});

/**
 * A solid as the textbook draws it (F9's `drawn`: the convention's places, the true view's depths), its ring atoms with depth and each a centre,
 * and a group one bond long on each free position asked for (by index in `solid.free`), drawn along that position's drawn direction, with no
 * depth. `form` 0 or 1, F9's two textbook pictures; `turn` the page turned, depth as it is; `depthScale` the depths alone scaled.
 * `truth` the solid's own volume of the bonds at an atom, in the order given (its H, -1, where it has one left: the free position not drawn).
 */
function asDrawn(
  solid: Solid,
  frees: readonly number[],
  { form = 0, turn = 0, depthScale = 1 }: { form?: 0 | 1; turn?: number; depthScale?: number } = {},
): { atoms: DrawnAtom[]; bonds: DrawnBond[]; truth: (at: number, order: readonly number[]) => number } {
  const d = drawn(solid, form)!;
  const n = solid.atoms.length;
  const degree = (k: number) => solid.bonds.filter(([a, b]) => a === k || b === k).length;
  const atoms: DrawnAtom[] = d.atoms.map((p, k) => ({ x: p.x, y: p.y, z: depthScale * p.z, el: "C", hs: 4 - degree(k), centre: true }));
  const bonds: DrawnBond[] = solid.bonds.map(([a, b]) => ({ a, b, order: 1 }));
  const groupOf = new Map<number, V3>();
  for (const f of frees) {
    const { free, x, y } = d.free[f];
    atoms[free.at].hs--;
    atoms.push({ x: atoms[free.at].x + x, y: atoms[free.at].y + y, el: "C", hs: 3 });
    bonds.push({ a: free.at, b: atoms.length - 1, order: 1 });
    groupOf.set(atoms.length - 1, free.direction);
  }
  const [c, sn] = [Math.cos(rad(turn)), Math.sin(rad(turn))];
  for (const a of atoms) [a.x, a.y] = [a.x * c - a.y * sn, a.x * sn + a.y * c];
  const truth = (at: number, order: readonly number[]) => {
    const ways = order.map((m): V3 => {
      if (m === -1) {
        const taken = new Set(bonds.filter((b) => b.a === at && b.b >= n).map((b) => groupOf.get(b.b)!));
        return solid.free.find((f) => f.at === at && !taken.has(f.direction))!.direction;
      }
      return groupOf.get(m) ?? sub(solid.atoms[m], solid.atoms[at]);
    });
    return Math.sign(dot(ways[0], cross(ways[1], ways[2])));
  };
  return { atoms, bonds, truth };
}

/** The single chair as the textbook draws it (`asDrawn`), a group on each position asked for, by atom and kind. */
function conventionChair(
  positions: readonly { at: number; kind: "axial" | "equatorial" }[],
  opts: { form?: 0 | 1; turn?: number; depthScale?: number } = {},
): { atoms: DrawnAtom[]; bonds: DrawnBond[]; truth: (at: number, _group: number, order: readonly number[]) => number } {
  const solid = chairSolid();
  const d = asDrawn(
    solid,
    positions.map((p) => solid.free.findIndex((f) => f.at === p.at && f.kind === p.kind)),
    opts,
  );
  return { ...d, truth: (at, _group, order) => d.truth(at, order) };
}

/**
 * Chairs fused, as F9 builds and draws them: the 18 two-ring systems (a fusion on each of the six bonds, trans and cis on either face), and the 81
 * three-ring ones - those of the first three bonds fused again on each bond of the new ring between two atoms of it alone, each way.
 */
function fusedSystems(): { two: [string, Solid][]; three: [string, Solid][]; both: [string, Solid][] } {
  const hows: ("trans" | { cis: 1 | -1 })[] = ["trans", { cis: 1 }, { cis: -1 }];
  const name = (h: (typeof hows)[number]) => (h === "trans" ? "trans" : `cis ${h.cis}`);
  const two: [string, Solid][] = [];
  const three: [string, Solid][] = [];
  for (let bond = 0; bond < 6; bond++)
    for (const how of hows) {
      const s = fused(chairSolid(), bond, "chair", how);
      if (!drawn(s)) continue;
      two.push([`bond ${bond} ${name(how)}`, s]);
      if (bond > 2) continue;
      const fusion = new Set(s.atoms.map((_, k) => k).filter((k) => s.bonds.filter(([a, b]) => a === k || b === k).length === 3));
      s.bonds.forEach(([a, b], k) => {
        if (k < 6 || fusion.has(a) || fusion.has(b)) return;
        for (const second of hows) {
          const t = fused(s, k, "chair", second);
          if (drawn(t) && drawn(t, 1)) three.push([`bond ${bond} ${name(how)}, then ${k} ${name(second)}`, t]);
        }
      });
    }
  // (and the 81 found in review: both further rings on the first chair, on each of the nine pairs of its bonds that share no atom - six one bond apart, three
  //  opposite - each fused each way; the middle ring is the first chair, where above it is a ring fused on)
  const both: [string, Solid][] = [];
  for (let b1 = 0; b1 < 6; b1++)
    for (let b2 = b1 + 2; b2 < 6; b2++) {
      if ((b2 + 1) % 6 === b1) continue;
      for (const h1 of hows)
        for (const h2 of hows) {
          const t = fused(fused(chairSolid(), b1, "chair", h1), b2, "chair", h2);
          if (drawn(t) && drawn(t, 1)) both.push([`bonds ${b1} ${name(h1)} and ${b2} ${name(h2)}`, t]);
        }
    }
  return { two, three, both };
}

describe("known answer 12: the chair as the convention draws it, read through readStereo", () => {
  it("reads every group on every free position, one at a time and two at an atom, in both forms, turned, at every depth scale, as the solid has it", () => {
    let tried = 0;
    const kinds = ["axial", "equatorial"] as const;
    for (const form of [0, 1] as const)
      for (const turn of [0, 20])
        for (const depthScale of [0.5, 1, 2])
          for (let at = 0; at < 6; at++) {
            const sets = [[kinds[0]], [kinds[1]], [...kinds]];
            for (const set of sets) {
              const d = conventionChair(
                set.map((kind) => ({ at, kind })),
                { form, turn, depthScale },
              );
              const got = readStereo(d.atoms, d.bonds).tetra.get(at);
              const label = `form ${form} turn ${turn} depth x${depthScale} atom ${at} ${set.join("+")}`;
              expect(got, label).toBeDefined();
              expect(got!.volume, label).toBe(d.truth(at, -1, got!.neighbours));
              tried++;
            }
          }
    expect(tried).toBe(2 * 2 * 3 * 6 * 3);
  });
});

describe("known answer 12: chairs fused, as F9 draws them, read through readStereo", () => {
  /** Every group at every atom of two ring bonds - on each position alone and both - of each system, both forms, turned, at every depth scale, read and set against the solid: the ones read otherwise. */
  const readAll = (systems: [string, Solid][]) => {
    let tried = 0;
    const wrong: string[] = [];
    for (const [name, solid] of systems) {
      const rings = (k: number) => solid.bonds.filter(([a, b]) => a === k || b === k).length;
      for (let at = 0; at < solid.atoms.length; at++) {
        if (rings(at) !== 2) continue;
        const mine = solid.free.map((f, i) => [f, i] as const).filter(([f]) => f.at === at).map(([, i]) => i);
        for (const set of [[mine[0]], [mine[1]], mine])
          for (const form of [0, 1] as const)
            for (const turn of [0, 20])
              for (const depthScale of [0.5, 1, 2]) {
                const d = asDrawn(solid, set, { form, turn, depthScale });
                const got = readStereo(d.atoms, d.bonds).tetra.get(at);
                tried++;
                if (!got || got.volume !== d.truth(at, got.neighbours)) wrong.push(`${name}: atom ${at} [${set}] form ${form} turn ${turn} x${depthScale}`);
              }
      }
    }
    return { tried, wrong };
  };
  // (measured at 18 s, the machine busy)
  it("reads every group of the 18 two-ring systems and of 81 three-ring ones, the third ring fused on the second, as the solid has it", { timeout: measured(18000) }, () => {
    const { two, three } = fusedSystems();
    expect(two).toHaveLength(18);
    expect(three).toHaveLength(81);
    const { tried, wrong } = readAll([...two, ...three]);
    expect(wrong.slice(0, 10)).toEqual([]);
    expect(tried).toBeGreaterThan(18 * 8 * 3 * 12);
  });

  // (measured at 17 s, the machine busy)
  it("reads every group of the 81 three-ring systems found in review, both further rings on the first chair, as the solid has it", { timeout: measured(17000) }, () => {
    const { both } = fusedSystems();
    expect(both).toHaveLength(81);
    const { tried, wrong } = readAll(both);
    expect(wrong.slice(0, 10)).toEqual([]);
    expect(tried).toBeGreaterThan(81 * 10 * 3 * 12 - 1);
  });
});

/** Where two bonds cross on the page, which passes behind: by each atom's depth, its own or worked out (`groupDepths`), as layout2d `brokenBehind` takes it. */
function crossings(d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }): { behind: number; front: number }[] {
  const worked = groupDepths(d.atoms, d.bonds);
  const z = (i: number) => d.atoms[i].z ?? worked.get(i);
  const out: { behind: number; front: number }[] = [];
  const cr = (p: { x: number; y: number }, q: { x: number; y: number }) => p.x * q.y - p.y * q.x;
  d.bonds.forEach((b, i) =>
    d.bonds.forEach((o, j) => {
      if (j <= i || [o.a, o.b].some((k) => k === b.a || k === b.b)) return;
      const [za, zb, zc, zd] = [z(b.a), z(b.b), z(o.a), z(o.b)];
      if (za == null || zb == null || zc == null || zd == null) return;
      const [p, e] = [d.atoms[b.a], d.atoms[o.a]];
      const dv = { x: d.atoms[b.b].x - p.x, y: d.atoms[b.b].y - p.y };
      const g = { x: d.atoms[o.b].x - e.x, y: d.atoms[o.b].y - e.y };
      const den = cr(dv, g);
      if (Math.abs(den) < 1e-9) return;
      const qp = { x: e.x - p.x, y: e.y - p.y };
      const [t, u] = [cr(qp, g) / den, cr(qp, dv) / den];
      if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return;
      const [mine, theirs] = [za + (zb - za) * t, zc + (zd - zc) * u];
      out.push(mine < theirs ? { behind: i, front: j } : { behind: j, front: i });
    }),
  );
  return out;
}

describe("point 8: a group's depth, worked out from the way its centre is read to send it", () => {
  const all = [0, 1, 2, 3, 4, 5].flatMap((at) => (["axial", "equatorial"] as const).map((kind) => ({ at, kind })));

  it("known answer 13: cyclohexane's chair as drawn, a group on each of its twelve free positions - exactly two crossings, a near atom's axial bond before the far seat line, a far atom's behind the near one", () => {
    for (const form of [0, 1] as const) {
      const d = conventionChair(all, { form });
      const found = crossings(d);
      expect(found, `form ${form}`).toHaveLength(2);
      const meanZ = d.atoms.slice(0, 6).reduce((s, a) => s + a.z!, 0) / 6;
      const ring = (i: number) => d.bonds[i].b < 6;
      const axialFrom = (i: number) => {
        const b = d.bonds[i];
        return b.b >= 6 && Math.abs(d.atoms[b.b].x - d.atoms[b.a].x) < 1e-9 ? b.a : null;
      };
      // (one: a near atom's axial bond in front, the ring bond behind it broken; the other: a far atom's axial bond behind, broken)
      const before = found.find((c) => ring(c.behind) && axialFrom(c.front) != null)!;
      const under = found.find((c) => ring(c.front) && axialFrom(c.behind) != null)!;
      expect(before, `form ${form}`).toBeDefined();
      expect(under, `form ${form}`).toBeDefined();
      expect(d.atoms[axialFrom(before.front)!].z!).toBeGreaterThan(meanZ);
      expect(d.atoms[axialFrom(under.behind)!].z!).toBeLessThan(meanZ);
      // (the near atom's axial goes up the page, the far atom's down)
      const up = (i: number) => Math.sign(d.atoms[d.bonds[i].b].y - d.atoms[d.bonds[i].a].y);
      expect(up(before.front)).toBe(-up(under.behind));
      expect([before.front, under.behind].map(up).sort()).toEqual([-1, 1]);
    }
  });

  it("gives a group the depth of the free way it is read on: its ring atom's depth plus that way's depth for one bond, times its length as drawn", () => {
    const d = conventionChair(all);
    const z = groupDepths(d.atoms, d.bonds);
    expect(z.size).toBe(12);
    const solid = chairSolid();
    const view = standardView(solid);
    for (const b of d.bonds.slice(6)) {
      const free = solid.free.find((f) => f.at === b.a && Math.hypot(d.atoms[b.b].x - d.atoms[b.a].x) < 1e-9 === (f.kind === "axial"))!;
      // (an axial group is before its ring atom where the ring atom is before the ring's middle; as the solid has it, in sign)
      expect(Math.sign(z.get(b.b)! - d.atoms[b.a].z!), `${b.a} ${free.kind}`).toBe(Math.sign(project(view, free.direction).z));
    }
  });

  it("scales the depth with the bond's drawn length, not its length on the page over the way's", () => {
    const short = conventionChair([{ at: 0, kind: "axial" }]);
    const long = conventionChair([{ at: 0, kind: "axial" }]);
    long.atoms[6] = { ...long.atoms[6], x: long.atoms[0].x + 2 * (long.atoms[6].x - long.atoms[0].x), y: long.atoms[0].y + 2 * (long.atoms[6].y - long.atoms[0].y) };
    const [a, b] = [groupDepths(short.atoms, short.bonds).get(6)!, groupDepths(long.atoms, long.bonds).get(6)!];
    const z0 = short.atoms[0].z!;
    expect(b - z0).toBeCloseTo(2 * (a - z0), 9);
    // (an axial way is all but in the page, seen from 25 degrees above: its depth part a sine of that, not a ratio that grows end-on)
    expect(Math.abs(a - z0)).toBeLessThan(1);
    expect(Math.abs(a - z0)).toBeGreaterThan(0.1);
  });

  it("gives a fusion atom's group (three ring bonds with depth) the way the three leave, and keeps a way seen all but end-on to its drawn length", () => {
    // trans-decalin seen from all but straight above: each fusion atom's H points at the viewer or away, drawn very short
    const solid = fused(chairSolid(), 0, "chair", "trans");
    const view = fromAbove(88);
    const spot = seen(solid, view);
    const atoms: DrawnAtom[] = spot.map((p, i) => ({ x: p.x, y: p.y, z: p.z, el: "C", hs: solid.bonds.filter(([a, b]) => a === i || b === i).length === 2 ? 2 : 1, centre: true }));
    const bonds: DrawnBond[] = solid.bonds.map(([a, b]) => ({ a, b, order: 1 }));
    const fusion = atoms.map((_, i) => i).filter((i) => solid.bonds.filter(([a, b]) => a === i || b === i).length === 3);
    expect(fusion).toHaveLength(2);
    for (const at of fusion) {
      const free = solid.free.find((f) => f.at === at)!;
      const g = project(view, free.direction);
      atoms[at].hs = 0;
      atoms.push({ x: atoms[at].x + g.x, y: atoms[at].y + g.y, el: "H", hs: 0 });
      bonds.push({ a: at, b: atoms.length - 1, order: 1 });
    }
    const z = groupDepths(atoms, bonds);
    for (const [k, at] of fusion.entries()) {
      const h = atoms.length - 2 + k;
      const drawnLength = Math.hypot(atoms[h].x - atoms[at].x, atoms[h].y - atoms[at].y);
      expect(drawnLength).toBeLessThan(0.1);
      const depth = z.get(h)! - atoms[at].z!;
      // (before or behind its atom as the solid has it; never further than the bond is drawn long)
      expect(Math.sign(depth), `${at}`).toBe(Math.sign(project(view, solid.free.find((f) => f.at === at)!.direction).z));
      expect(Math.abs(depth)).toBeLessThanOrEqual(drawnLength + 1e-9);
      expect(Math.abs(depth)).toBeGreaterThan(0.9 * drawnLength);
    }
  });

  it("puts a group's further atoms at its first atom's depth", () => {
    const d = conventionChair([{ at: 0, kind: "equatorial" }]);
    const g = d.atoms[6];
    d.atoms.push({ x: g.x + 0.8, y: g.y + 0.6, el: "O", hs: 1 });
    d.bonds.push({ a: 6, b: 7, order: 1 });
    const z = groupDepths(d.atoms, d.bonds);
    expect(z.get(7)).toBe(z.get(6));
  });

  it("gives no depth to a group drawn half way between two free ways, nor to one on a centre with a wavy bond, nor to an atom between two atoms with depth", () => {
    // half way between axial and equatorial
    const d = conventionChair([{ at: 1, kind: "axial" }]);
    const ax = { x: d.atoms[6].x - d.atoms[1].x, y: d.atoms[6].y - d.atoms[1].y };
    const e = conventionChair([{ at: 1, kind: "equatorial" }]);
    const eq = { x: e.atoms[6].x - e.atoms[1].x, y: e.atoms[6].y - e.atoms[1].y };
    const half = { x: ax.x + eq.x, y: ax.y + eq.y };
    const l = Math.hypot(half.x, half.y);
    d.atoms[6] = { ...d.atoms[6], x: d.atoms[1].x + half.x / l, y: d.atoms[1].y + half.y / l };
    expect(readStereo(d.atoms, d.bonds).tetra.has(1)).toBe(false);
    expect(groupDepths(d.atoms, d.bonds).has(6)).toBe(false);
    // a wavy bond at the centre
    const w = conventionChair([{ at: 1, kind: "axial" }, { at: 1, kind: "equatorial" }]);
    w.bonds[6] = { ...w.bonds[6], either: true };
    const wz = groupDepths(w.atoms, w.bonds);
    expect(wz.has(6) || wz.has(7)).toBe(false);
    // an atom bonded to two ring atoms with depth: neither's group
    const b = conventionChair([{ at: 0, kind: "axial" }]);
    b.bonds.push({ a: 3, b: 6, order: 1 });
    expect(groupDepths(b.atoms, b.bonds).has(6)).toBe(false);
  });

  it("works out nothing for a drawing with no depth, or with depth on every atom", () => {
    const d = conventionChair(all);
    const flat = { atoms: d.atoms.map(({ z: _z, ...a }) => a), bonds: d.bonds };
    expect(groupDepths(flat.atoms, flat.bonds).size).toBe(0);
    const worked = groupDepths(d.atoms, d.bonds);
    const deep = { atoms: d.atoms.map((a, i) => ({ ...a, z: a.z ?? worked.get(i)! })), bonds: d.bonds };
    expect(groupDepths(deep.atoms, deep.bonds).size).toBe(0);
  });

  it("leaves the reading as it was (known answers 1 to 6): the groups given their worked-out depth read the same", () => {
    const cases: [string, { atoms: DrawnAtom[]; bonds: DrawnBond[] }][] = [
      ["trans eq", chair({ 0: "equatorial", 1: "equatorial" })],
      ["trans ax", chair({ 0: "axial", 1: "axial" })],
      ["cis", chair({ 0: "axial", 1: "equatorial" })],
      ["cis flipped", chair({ 0: "equatorial", 1: "axial" }, 70, "turned over")],
      ["menthol", chair({ 0: { place: "equatorial", el: "O", hs: 1 }, 1: { place: "equatorial", branches: 2 }, 4: "equatorial" })],
      ["beta-glucopyranose", haworth([true, false, true, false, true])],
      ["alpha-glucopyranose", haworth([false, false, true, false, true])],
      ["all-equatorial chair", conventionChair(all.filter((p) => p.kind === "equatorial").slice(0, 5))],
      ["meso Newman", newman({ methyl: 90, bromine: -30 }, { methyl: -90, bromine: 30 })],
      ["(2R,3R) Newman", newman({ methyl: 90, bromine: -30 }, { methyl: 30, bromine: -90 })],
    ];
    for (const [name, d] of cases) {
      const worked = groupDepths(d.atoms, d.bonds);
      expect(worked.size, name).toBeGreaterThan(0);
      const deep = d.atoms.map((a, i) => (worked.has(i) ? { ...a, z: worked.get(i)! } : a));
      const [was, now] = [readStereo(d.atoms, d.bonds).tetra, readStereo(deep, d.bonds).tetra];
      expect(now.size, name).toBe(was.size);
      for (const [c, t] of was) expect(sameConfiguration(t, now.get(c)!), `${name} ${c}`).toBe(true);
    }
  });
});

describe("known answer 13: the crossings of chairs fused, every position filled", () => {
  it("puts behind, at every crossing of the 18 two-ring systems, the bond the solid's true depths put behind", () => {
    const { two } = fusedSystems();
    let crossed = 0;
    for (const [name, solid] of two) {
      const d = asDrawn(solid, solid.free.map((_, i) => i));
      // (the solid's own depth of each atom, in its true view; a group's end one bond out along its position)
      const view = standardView(solid, 0);
      const trueZ = (k: number) => {
        if (k < solid.atoms.length) return project(view, solid.atoms[k]).z;
        const b = d.bonds.find((x) => x.b === k)!;
        return project(view, solid.atoms[b.a]).z + project(view, solid.free[k - solid.atoms.length].direction).z;
      };
      for (const c of crossings(d)) {
        crossed++;
        // (where they cross, as drawn: each bond's true depth there)
        const [p, q] = [d.bonds[c.behind], d.bonds[c.front]];
        const along = (b: DrawnBond, o: DrawnBond) => {
          const [A, B, C, D] = [d.atoms[b.a], d.atoms[b.b], d.atoms[o.a], d.atoms[o.b]];
          const den = (B.x - A.x) * (D.y - C.y) - (B.y - A.y) * (D.x - C.x);
          return ((C.x - A.x) * (D.y - C.y) - (C.y - A.y) * (D.x - C.x)) / den;
        };
        const zAt = (b: DrawnBond, t: number) => trueZ(b.a) + (trueZ(b.b) - trueZ(b.a)) * t;
        expect(zAt(p, along(p, q)), `${name}: bond ${c.behind} under ${c.front}`).toBeLessThan(zAt(q, along(q, p)));
      }
    }
    // (found in review, calculated on the convention: 74)
    expect(crossed, "crossings over the 18").toBe(74);
  });
});
