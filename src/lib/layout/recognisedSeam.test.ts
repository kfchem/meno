/**
 * The seam between the core's reading of rings drawn in perspective and the engine's views of cages (found in review): a bridged system
 * asked of the core without the views is read as drawn; the views are asked only as the reading needs them - never for a drawing of single
 * rings, the provider asked once for a fused system, its views never; the views asked for a bridged system; a cage whose rings share bonds,
 * not three atoms (cubane), read by its views too; a hydrogen bond between two groups of a chair closes no ring; a drawing changed in place
 * read again; and the words each reading says.
 */
import { describe, expect, it } from "vitest";
import type { DrawnAtom, DrawnBond } from "./drawn";
import { layout2D } from "./engine";
import { BETWEEN_AXIAL_AND_EQUATORIAL, recognisedSaid, withRecognisedDepth, type CageViewsOf } from "../chem/perception/projection/depth";
import { cageViews } from "./recognised";
import { fromSmiles } from "./testdata/fromSmiles";
import { chair, haworth } from "./testdata/projections";
import { READ_AS_HAWORTH, READ_IN_PERSPECTIVE } from "../chem/perception/projection/recognise";

const stripped = (d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }) => ({ atoms: d.atoms.map(({ z: _z, centre: _c, ...a }) => a), bonds: d.bonds });
const engineDrawn = (smi: string) => {
  const input = fromSmiles(smi);
  const out = layout2D(input);
  return { atoms: input.atoms.map((a, i): DrawnAtom => ({ x: out.x[i], y: out.y[i], hs: a.hs ?? 0, el: a.el, ...(out.depth[i] != null ? { z: out.depth[i]!, centre: true } : {}) })), bonds: input.bonds.map(({ a, b, order }): DrawnBond => ({ a, b, order })) };
};
/** The cage provider of the app, counting what is asked of it: the drawing, the systems, and the views. */
const counting = () => {
  const n = { provider: 0, systems: 0, views: 0 };
  const provider: CageViewsOf = (atoms, bonds) => {
    n.provider++;
    const of = cageViews(atoms, bonds);
    return (system) => {
      n.systems++;
      const got = of(system);
      return { cage: got.cage, views: () => (n.views++, got.views()) };
    };
  };
  return { n, provider };
};
/** Norbornan-2-ol as the engine draws it, its depth taken away, the bond nearest the viewer bold (as the file's `marked` and `nearest` do). */
const norbornane = () => {
  const d = engineDrawn("O[C@@H]1C[C@@H]2CC[C@H]1C2");
  const near = d.bonds
    .map((b, k) => ({ k, z: (d.atoms[b.a].z ?? -Infinity) + (d.atoms[b.b].z ?? -Infinity), ring: d.atoms[b.a].el === "C" && d.atoms[b.b].el === "C" }))
    .filter((b) => b.ring)
    .sort((p, q) => q.z - p.z)[0].k;
  const bare = stripped(d);
  return { atoms: bare.atoms, bonds: bare.bonds.map((b, k) => (k === near ? { ...b, bold: true } : b)) };
};

describe("the seam between the core's reading and the engine's views of cages", () => {
  it("a bridged system asked of the core with no views is read as drawn: no depth, and no words", () => {
    const d = norbornane();
    expect(withRecognisedDepth(d.atoms, d.bonds)).toBe(d.atoms);
    expect(recognisedSaid(d.atoms, d.bonds).size).toBe(0);
    // (and with the engine's views it is read: the same drawing)
    expect(withRecognisedDepth(d.atoms, d.bonds, cageViews)).not.toBe(d.atoms);
  }, 60_000);

  it("a cage whose rings share bonds, not three atoms (cubane), is read by its views, a near edge bold: all eight atoms get a depth; with no mark, none", () => {
    const d = engineDrawn("C12C3C4C1C5C2C3C45");
    const bare = stripped(d);
    const near = d.bonds.map((b, k) => ({ k, z: (d.atoms[b.a].z ?? -Infinity) + (d.atoms[b.b].z ?? -Infinity) })).sort((p, q) => q.z - p.z)[0].k;
    const marked = { atoms: bare.atoms, bonds: bare.bonds.map((b, k) => (k === near ? { ...b, bold: true } : b)) };
    expect(withRecognisedDepth(marked.atoms, marked.bonds, cageViews).filter((a) => a.z != null)).toHaveLength(8);
    expect(withRecognisedDepth(bare.atoms, bare.bonds, cageViews)).toBe(bare.atoms);
  }, 60_000);

  it("a hydrogen bond between two axial groups of a chair closes no ring: the chair is still read; the same bond as a real one, it is not", () => {
    const d = stripped(chair({ 0: "axial", 2: "axial" }));
    const [p, q] = [d.atoms.length - 2, d.atoms.length - 1];
    const hydrogen = { atoms: d.atoms, bonds: [...d.bonds, { a: p, b: q, order: 1, hydrogen: true }] };
    expect(withRecognisedDepth(hydrogen.atoms, hydrogen.bonds, cageViews)).not.toBe(hydrogen.atoms);
    const real = { atoms: d.atoms.map((a) => ({ ...a })), bonds: [...d.bonds, { a: p, b: q, order: 1 }] };
    expect(withRecognisedDepth(real.atoms, real.bonds, cageViews)).toBe(real.atoms);
  });

  describe("a drawing changed in place, between two reads of the same arrays, is read again", () => {
    const chairOf = () => stripped(chair({ 0: "equatorial", 1: "equatorial" }));
    const zs = (atoms: readonly DrawnAtom[]) => atoms.map((a) => (a.z == null ? null : Math.round(a.z * 1e6) / 1e6));
    it("an atom moved, so that it is no chair", () => {
      const d = chairOf();
      expect(withRecognisedDepth(d.atoms, d.bonds, cageViews)).not.toBe(d.atoms);
      d.atoms[3] = { ...d.atoms[3], x: d.atoms[3].x + 6 };
      const fresh = withRecognisedDepth(d.atoms.map((a) => ({ ...a })), d.bonds.map((b) => ({ ...b })), cageViews);
      expect(zs(withRecognisedDepth(d.atoms, d.bonds, cageViews))).toEqual(zs(fresh));
    });
    it("an atom given a depth: the ring is then drawn with one, and left as it is", () => {
      const d = chairOf();
      withRecognisedDepth(d.atoms, d.bonds, cageViews);
      d.atoms[0] = { ...d.atoms[0], z: 0.3 } as (typeof d.atoms)[number];
      expect(withRecognisedDepth(d.atoms, d.bonds, cageViews)).toBe(d.atoms);
    });
    it("a bond given a wedge: read as it always was, no depth worked out", () => {
      const d = chairOf();
      withRecognisedDepth(d.atoms, d.bonds, cageViews);
      d.bonds[6] = { ...d.bonds[6], wedge: { narrow: d.bonds[6].a, stereo: "up" } };
      expect(withRecognisedDepth(d.atoms, d.bonds, cageViews)).toBe(d.atoms);
    });
    it("a bond made bold: the near edge it says, not the convention's", () => {
      const d = chairOf();
      withRecognisedDepth(d.atoms, d.bonds, cageViews);
      // (the ring bond whose atoms are the highest on the page marked: the mirror of what the convention gives)
      const upper = [0, 1, 2, 3, 4, 5].reduce((best, k) => (d.atoms[k].y + d.atoms[(k + 1) % 6].y > d.atoms[best].y + d.atoms[(best + 1) % 6].y ? k : best), 0);
      const k = d.bonds.findIndex((b) => (b.a === upper && b.b === (upper + 1) % 6) || (b.b === upper && b.a === (upper + 1) % 6));
      d.bonds[k] = { ...d.bonds[k], bold: true };
      const fresh = withRecognisedDepth(d.atoms.map((a) => ({ ...a })), d.bonds.map((b) => ({ ...b })), cageViews);
      expect(zs(withRecognisedDepth(d.atoms, d.bonds, cageViews))).toEqual(zs(fresh));
      expect(zs(fresh)).not.toEqual(zs(withRecognisedDepth(chairOf().atoms, chairOf().bonds, cageViews)));
    });
  });

  it("says what it read: a chair 'in perspective', a Haworth ring 'as a Haworth ring', and a chair on its side not read, saying why", () => {
    const c = stripped(chair({ 0: "equatorial", 1: "equatorial" }));
    expect([...new Set(recognisedSaid(c.atoms, c.bonds, cageViews).values())]).toEqual([READ_IN_PERSPECTIVE]);
    const h = stripped(haworth([true, false, true, false, true], 30));
    expect([...new Set(recognisedSaid(h.atoms, h.bonds, cageViews).values())]).toEqual([READ_AS_HAWORTH]);
    const side = { atoms: c.atoms.map((a) => ({ ...a, x: -a.y, y: a.x })), bonds: c.bonds };
    expect(withRecognisedDepth(side.atoms, side.bonds, cageViews)).toBe(side.atoms);
    const said = [...recognisedSaid(side.atoms, side.bonds, cageViews).values()];
    expect(said.length).toBeGreaterThan(0);
    expect(said.every((w) => w !== READ_IN_PERSPECTIVE && w !== READ_AS_HAWORTH)).toBe(true);
  });

  it("a hydrogen bond across a bridged system closes no ring for the engine's views either: norbornan-2-ol with one from its OH to a CH2, marked, is read as without it", () => {
    const d = norbornane();
    const o = d.atoms.findIndex((a) => a.el === "O");
    const far = d.atoms.findIndex((a, i) => a.el === "C" && !d.bonds.some((b) => (b.a === o && b.b === i) || (b.b === o && b.a === i)) && i > 3);
    const plain = withRecognisedDepth(d.atoms.map((a) => ({ ...a })), d.bonds.map((b) => ({ ...b })), cageViews);
    const withH = { atoms: d.atoms.map((a) => ({ ...a })), bonds: [...d.bonds.map((b) => ({ ...b })), { a: o, b: far, order: 1, hydrogen: true }] };
    const got = withRecognisedDepth(withH.atoms, withH.bonds, cageViews);
    expect(plain.filter((a) => a.z != null).length).toBeGreaterThan(0);
    expect(got.map((a) => (a.z == null ? null : Math.round(a.z * 1e6) / 1e6))).toEqual(plain.map((a) => (a.z == null ? null : Math.round(a.z * 1e6) / 1e6)));
  }, 60_000);

  it("a chair needs no views: read the same with and without them", () => {
    const d = stripped(chair({ 0: "equatorial", 1: "equatorial" }));
    const [without, withViews] = [withRecognisedDepth(d.atoms, d.bonds), withRecognisedDepth(d.atoms.map((a) => ({ ...a })), d.bonds, cageViews)];
    expect(without).not.toBe(d.atoms);
    expect(without.map((a) => a.z)).toEqual(withViews.map((a) => a.z));
  });

  it("the views are never asked for single rings, once for the drawing of a fused system but never its views, and its views for a bridged one", () => {
    const single = counting();
    const c = stripped(chair({ 0: "equatorial", 1: "equatorial" }));
    withRecognisedDepth(c.atoms, c.bonds, single.provider);
    expect(single.n).toEqual({ provider: 0, systems: 0, views: 0 });
    // (decalin drawn flat: two rings sharing a bond: the engine's test for a cage asked, its views not)
    const decalin = stripped(engineDrawn("C1CCC2CCCCC2C1"));
    const fusedCount = counting();
    withRecognisedDepth(decalin.atoms, decalin.bonds, fusedCount.provider);
    expect(fusedCount.n.provider).toBe(1);
    expect(fusedCount.n.systems).toBe(1);
    expect(fusedCount.n.views).toBe(0);
    const bridged = counting();
    const d = norbornane();
    withRecognisedDepth(d.atoms, d.bonds, bridged.provider);
    expect(bridged.n.provider).toBe(1);
    expect(bridged.n.views).toBeGreaterThan(0);
  }, 60_000);
});

describe("a chair's group drawn between axial and equatorial (found in review)", () => {
  /** A chair drawn by hand, no depth: a methyl on ring atom 0, axial or slanted half way to equatorial; ring atom 0 an N+ with its H where asked. */
  const drawnChair = (slanted: boolean, ammonium: boolean) => {
    const ax = chair({ 0: "axial" });
    const eq = chair({ 0: "equatorial" });
    const g = ax.atoms.length - 1;
    const at = ax.atoms[0];
    const unit = (p: { x: number; y: number }) => {
      const l = Math.hypot(p.x - at.x, p.y - at.y);
      return { x: (p.x - at.x) / l, y: (p.y - at.y) / l };
    };
    const [u, v] = [unit(ax.atoms[g]), unit(eq.atoms[g])];
    const l = Math.hypot(u.x + v.x, u.y + v.y);
    const bond = Math.hypot(ax.atoms[g].x - at.x, ax.atoms[g].y - at.y);
    const atoms = ax.atoms.map((a, i) => {
      const plain = { ...a, z: undefined, centre: undefined };
      if (i === g && slanted) return { ...plain, x: at.x + ((u.x + v.x) / l) * bond, y: at.y + ((u.y + v.y) / l) * bond };
      if (i === 0 && ammonium) return { ...plain, el: "N", charge: 1, hs: 1 };
      return plain;
    });
    return { atoms, bonds: ax.bonds };
  };
  const between = (d: ReturnType<typeof drawnChair>) => [...recognisedSaid(d.atoms, d.bonds, cageViews)].filter(([, w]) => w === BETWEEN_AXIAL_AND_EQUATORIAL).map(([i]) => i);

  it("is said so at its ring atom, and only there", () => {
    expect(between(drawnChair(true, false))).toEqual([0]);
    expect(between(drawnChair(false, false))).toEqual([]);
  });

  it("is said nothing of at an ammonium's N with its H, which carries no configuration, its methyl axial or slanted", () => {
    expect(between(drawnChair(false, true))).toEqual([]);
    expect(between(drawnChair(true, true))).toEqual([]);
  });
});
