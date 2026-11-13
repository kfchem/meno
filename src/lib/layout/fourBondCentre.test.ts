import { describe, expect, it } from "vitest";
import { layout2D, type Layout2D } from "./engine";
import type { LayoutInput } from "./perceive";
import { drawnVolume, placeStereo } from "./stereo";
import { perceive } from "./perceive";
import { centreRoles, FRAMES, fourCentreRoot, fourCentreWays, sidesOf } from "./assemble";
import { layoutMetrics } from "./metrics";
import { fromSmiles } from "./testdata/fromSmiles";

// A stereocentre with four bonds drawn (Brecher 2006, ST-1.1.1, ST-1.1.4, ST-1.3.4, ST-0.2, ST-0.5; Brecher 2008, GR-4.1.3).

const DEG = Math.PI / 180;

/** A centre's configuration as the drawing shows it, against the one given: 1 where they agree. */
function agrees(input: LayoutInput, out: Layout2D, centre: number): boolean {
  const t = input.atoms[centre].tetra!;
  const h = out.hydrogens.find((x) => x.on === centre);
  const point = (n: number) => (n === -1 ? (h ? h.at : null) : { x: out.x[n], y: out.y[n] });
  const lift = t.neighbours.map((n) => {
    const w = out.wedges.find((x) => x.from === centre && x.to === n);
    return w ? (w.stereo === "up" ? 1 : -1) : 0;
  });
  return drawnVolume({ x: out.x[centre], y: out.y[centre] }, t.neighbours.map(point), lift) === t.volume;
}

/** The directions of a centre's bonds, in degrees, and its wedges by the atom at their wide end. */
function round(input: LayoutInput, out: Layout2D, centre: number) {
  const nb = input.bonds.flatMap((b) => (b.a === centre ? [b.b] : b.b === centre ? [b.a] : []));
  const toward = new Map(nb.map((n) => [n, Math.atan2(out.y[n] - out.y[centre], out.x[n] - out.x[centre]) / DEG]));
  const wedged = new Map(out.wedges.filter((w) => w.from === centre).map((w) => [w.to, w.stereo]));
  return { nb, toward, wedged };
}

/** How far apart two directions are, in degrees, the shorter way. */
const apart = (p: number, q: number) => {
  const d = Math.abs(p - q) % 360;
  return d > 180 ? 360 - d : d;
};

/** How near a direction comes to the page's axes, in degrees. */
const offAxes = (t: number) => {
  const r = ((t % 90) + 90) % 90;
  return Math.min(r, 90 - r);
};

/** That the centre is drawn as ST-1.1.1 draws it: a solid and a hashed wedge on `wedged`, a sixth of a turn apart, its other two plain a third of a turn apart, each a quarter from the wedge beside it; no bond on the page's axes. */
function expectPreferred(input: LayoutInput, out: Layout2D, centre: number, wedged: number[]) {
  const r = round(input, out, centre);
  expect([...r.wedged.keys()].sort((p, q) => p - q)).toEqual([...wedged].sort((p, q) => p - q));
  expect(new Set(r.wedged.values())).toEqual(new Set(["up", "down"]));
  const plain = r.nb.filter((n) => !wedged.includes(n));
  const t = (n: number) => r.toward.get(n)!;
  expect(apart(t(wedged[0]), t(wedged[1]))).toBeCloseTo(60, 0);
  expect(apart(t(plain[0]), t(plain[1]))).toBeCloseTo(120, 0);
  for (const w of wedged) expect(Math.min(...plain.map((p) => apart(t(w), t(p))))).toBeCloseTo(90, 0);
  for (const n of r.nb) expect(offAxes(t(n)), `bond to ${n} at ${t(n).toFixed(1)}`).toBeGreaterThan(7.5);
  expect(agrees(input, out, centre)).toBe(true);
}

describe("an acyclic stereocentre with four bonds drawn (ST-1.1.1)", () => {
  it("draws CH3-CFClBr, each way round, with a solid and a hashed wedge on two halogens side by side, its methyl plain - not a cross with one wedge (ST-1.1.4's form, not for four acyclic groups)", () => {
    for (const s of ["C[C@](F)(Cl)Br", "C[C@@](F)(Cl)Br"]) {
      const input = fromSmiles(s);
      const out = layout2D(input);
      const r = round(input, out, 1);
      expect(r.wedged.has(0), s).toBe(false);
      expect(r.wedged.has(2), s).toBe(true);
      expectPreferred(input, out, 1, [...r.wedged.keys()]);
    }
  });

  it("draws 2-chloro-2-fluorobutane with its methyl drawn: the wedges on F and Cl, the methyl and the ethyl plain, the chain running on through them", () => {
    for (const s of ["C[C@](F)(Cl)CC", "C[C@@](F)(Cl)CC", "CC[C@](C)(F)Cl"]) {
      const input = fromSmiles(s);
      const out = layout2D(input);
      const centre = input.atoms.findIndex((a) => a.tetra);
      const halogens = input.atoms.flatMap((a, i) => (a.el === "F" || a.el === "Cl" ? [i] : []));
      expectPreferred(input, out, centre, halogens);
    }
  });

  it("draws two adjacent quaternary centres each so, the bond between them plain (ST-0.5)", () => {
    const input = fromSmiles("C[C@@](F)(Cl)[C@@](C)(F)Br");
    const out = layout2D(input);
    expect(out.wedges.some((w) => (w.from === 1 && w.to === 4) || (w.from === 4 && w.to === 1))).toBe(false);
    expectPreferred(input, out, 1, [2, 3]);
    expectPreferred(input, out, 4, [6, 7]);
  });

  it("keeps all four bonds off the page's axes wherever the centre hangs: from a ring, in a chain, at an amino acid's alpha carbon", () => {
    for (const s of ["C[C@](F)(Cl)c1ccccc1", "CC[C@](C)(O)c1ccccc1", "C1CCCCC1[C@](C)(F)Cl", "OC(=O)[C@](C)(N)Cc1ccccc1", "C[C@](O)(CC)CCC", "C[C@@](N)(C(=O)O)CC(C)C", "CC(C)(C)[C@](C)(O)CC"]) {
      const input = fromSmiles(s);
      const out = layout2D(input);
      const centre = input.atoms.findIndex((a) => a.tetra);
      const r = round(input, out, centre);
      expect(r.wedged.size, s).toBe(2);
      for (const n of r.nb) expect(offAxes(r.toward.get(n)!), `${s}: bond to ${n} at ${r.toward.get(n)!.toFixed(1)}`).toBeGreaterThan(7.5);
      expectPreferred(input, out, centre, [...r.wedged.keys()]);
    }
  });

  it("leaves a ring atom's two groups as they were: a solid and a hashed wedge on the two out of the ring", () => {
    const input = fromSmiles("C[C@]1(O)CCCCC1");
    const out = layout2D(input);
    const r = round(input, out, 1);
    expect([...r.wedged.keys()].sort()).toEqual([0, 2]);
    expect(agrees(input, out, 1)).toBe(true);
  });

  it("shows a centre with an H as before: one wedge", () => {
    const input = fromSmiles("C[C@H](F)Cl");
    const out = layout2D(input);
    expect(out.wedges.filter((w) => w.from === 1)).toHaveLength(1);
    expect(agrees(input, out, 1)).toBe(true);
  });
});

describe("a phosphorus or sulfur stereocentre with a double bond (ST-1.5)", () => {
  it("draws a phosphine oxide's P, each way round, with a solid and a hashed wedge on two singly bonded ligands, its P=O plain", () => {
    for (const s of ["C[P@](=O)(CC)c1ccccc1", "C[P@@](=O)(CC)c1ccccc1"]) {
      const input = fromSmiles(s);
      const out = layout2D(input);
      const r = round(input, out, 1);
      expect(r.wedged.has(2), s).toBe(false);
      expectPreferred(input, out, 1, [...r.wedged.keys()]);
    }
  });

  it("draws a sulfoximine's S with its S=O and S=N plain, 120 degrees apart, the wedges on its methyl and its phenyl", () => {
    for (const s of ["C[S@](=O)(=N)c1ccccc1", "C[S@@](=O)(=N)c1ccccc1"]) {
      const input = fromSmiles(s);
      const out = layout2D(input);
      expectPreferred(input, out, 1, [0, 4]);
    }
  });

  it("never wedges a double bond, though it is drawn next to a single one a sixth of a turn away: the P=O stays plain", () => {
    const input = fromSmiles("C[P@](=O)(CC)c1ccccc1");
    const mol = perceive(input);
    const at = (deg: number) => ({ x: Math.cos(deg * DEG), y: Math.sin(deg * DEG) });
    // (the P at the origin; its O at 60 degrees and its methyl at 120 - the pair a sixth of a turn apart - its ethyl and phenyl below)
    const pos = new Map<number, { x: number; y: number }>([[1, { x: 0, y: 0 }], [2, at(60)], [0, at(120)], [3, at(-30)], [5, at(-150)]]);
    input.atoms.forEach((_, i) => pos.has(i) || pos.set(i, { x: 5 + i, y: 5 }));
    const { wedges } = placeStereo(mol, pos, new Map([[1, input.atoms[1].tetra!]]));
    expect(wedges.some((w) => w.from === 1 && w.to === 2)).toBe(false);
  });

  it("leaves a phosphate that is no stereocentre a cross, square to the page, with no wedge", () => {
    const input = fromSmiles("COP(=O)(OC)OC");
    const out = layout2D(input);
    const r = round(input, out, 2);
    expect(r.wedged.size).toBe(0);
    const t = [...r.toward.values()].sort((p, q) => p - q);
    for (let i = 0; i < 4; i++) expect(apart(t[i], t[(i + 1) % 4])).toBeCloseTo(90, 0);
  });
});

describe("a spiro centre (ST-1.3.4)", () => {
  it("draws a spiro[4.5]decanone's centre with a solid and a hashed wedge on the two bonds of its smaller ring, the six-ring's plain", () => {
    for (const s of ["O=C1CCC[C@]12CCC(C)(C)CC2", "O=C1CCC[C@@]12CCC(C)(C)CC2"]) {
      const input = fromSmiles(s);
      const out = layout2D(input);
      const centre = input.atoms.findIndex((a) => a.tetra);
      const r = round(input, out, centre);
      // (the five-ring's two atoms beside the centre: the carbonyl carbon and C4)
      expect([...r.wedged.keys()].sort((p, q) => p - q), s).toEqual([1, 4]);
      expect(new Set(r.wedged.values()), s).toEqual(new Set(["up", "down"]));
      expect(agrees(input, out, centre), s).toBe(true);
    }
  });

  it("draws a spiro centre between two rings of one size with both wedges on one ring", () => {
    const input = fromSmiles("O=C1CCC[C@]12CCCC2=O");
    const out = layout2D(input);
    // (the spiro atom 5; its first ring's atoms beside it 1 and 4, its second's 6 and 9)
    const r = round(input, out, 5);
    expect(r.wedged.size).toBe(2);
    const keys = [...r.wedged.keys()].sort((p, q) => p - q);
    expect([[1, 4], [6, 9]]).toContainEqual(keys);
    expect(agrees(input, out, 5)).toBe(true);
  });

  it("takes the other ring where a wedge on the smaller one would join two centres: the six-ring's two, its five-ring's C1 a centre", () => {
    const input = fromSmiles("C[C@H]1CCC[C@]12CCCCC2=O");
    const out = layout2D(input);
    // (the spiro atom 5; the five-ring's atoms beside it 1, a centre, and 4; the six-ring's 6 and 10)
    const r = round(input, out, 5);
    expect([...r.wedged.keys()].sort((p, q) => p - q)).toEqual([6, 10]);
    expect(new Set(r.wedged.values())).toEqual(new Set(["up", "down"]));
    expect(agrees(input, out, 5)).toBe(true);
  });
});

describe("a ring atom whose only bond out of its rings goes to another centre (ST-0.2)", () => {
  it("wedges a ring bond rather than the bond between the two centres: a decalin's bridgehead carrying CH(OH)CH3", () => {
    const input = fromSmiles("C[C@H](O)[C@@]12CCCC[C@@H]1CCCC2");
    const out = layout2D(input);
    const at = out.wedges.filter((w) => w.from === 3 || w.to === 3);
    expect(at.some((w) => (w.from === 3 && w.to === 1) || (w.from === 1 && w.to === 3))).toBe(false);
    expect(agrees(input, out, 3)).toBe(true);
    expect(agrees(input, out, 1)).toBe(true);
  });
});

describe("the rules a four-bond stereocentre is drawn by, one at a time", () => {
  const deg = (t: number) => ((((t / DEG) % 360) + 360) % 360);

  it("takes, from any bond into it on the lattice not itself on an axis, the way round that keeps all four bonds off the axes (`fourCentreWays`)", () => {
    for (let k = 0; k < 12; k++) {
      const p = k * 30 * DEG;
      if (offAxes(k * 30) < 7.5) continue;
      for (const inPage of [true, false]) {
        const ways = fourCentreWays(p, inPage);
        for (const t of [p, ...ways]) expect(offAxes(deg(t)), `from ${k * 30}, ${inPage}: ${deg(t).toFixed(0)}`).toBeGreaterThan(7.5);
        // (the form: from the bond into it, a third and a sixth of a turn as its kind says, and a quarter)
        expect(apart(deg(ways[0]), k * 30)).toBeCloseTo(inPage ? 120 : 60, 9);
      }
    }
  });

  it("puts a centre that is placed first off the axes in every frame the layout tries (`fourCentreRoot`)", () => {
    for (const frame of FRAMES) {
      const set = (t: number) => (frame.mirrored ? Math.PI - t : t) + frame.turn;
      const ways = fourCentreRoot(set);
      for (const t of ways) expect(offAxes(deg(t)), `${frame.turn / DEG} ${frame.mirrored}: ${deg(t).toFixed(0)}`).toBeGreaterThan(7.5);
      const sorted = ways.map(deg).sort((p, q) => p - q);
      const gaps = sorted.map((t, i) => (i + 1 < 4 ? sorted[i + 1] : sorted[0] + 360) - t).sort((p, q) => p - q);
      expect(gaps.map((g) => Math.round(g))).toEqual([60, 90, 90, 120]);
    }
  });

  it("puts in the page the heavier group, a neighbouring centre before a group as heavy, and a carbon end before another end written as large (`centreRoles`)", () => {
    const roles = (smiles: string, centre: number) => {
      const mol = perceive(fromSmiles(smiles));
      return centreRoles(mol, sidesOf(mol), centre);
    };
    // (an ethoxy, three atoms, in the page before the ends - methyl, F, Cl - though its O is no carbon)
    expect(roles("C[C@](F)(OCC)Cl", 1).plain).toContain(3);
    // (C3's neighbouring centre C1, as heavy as its propyl and its 2-hydroxyethyl and written smaller than either: in the page, the bond
    // between the two centres plain - ST-0.5)
    expect(roles("C[C@@H](F)[C@](F)(CCC)CCO", 3).plain).toContain(1);
    // (the methyl and the NH2 written as large: the carbon end in the page, the NH2 wedged - GR-4.1.3)
    const r = roles("CC[C@](C)(N)F", 2);
    expect(r.plain.sort()).toEqual([1, 3]);
    expect(r.wedged).toContain(4);
  });

  it("scores such a centre against its own gaps - a third, a quarter, a sixth, a quarter - not a cross's", () => {
    const star = (degs: number[]) =>
      layoutMetrics({
        x: [0, ...degs.map((d) => Math.cos(d * DEG))],
        y: [0, ...degs.map((d) => Math.sin(d * DEG))],
        edges: degs.map((_, i) => [0, i + 1] as [number, number]),
        elements: ["C", "C", "F", "Cl", "Br"],
        hydrogens: [0, 3, 0, 0, 0],
        tetra: [{ neighbours: [1, 2, 3, 4], volume: 1 }, null, null, null, null],
      }).angleError;
    expect(star([210, 330, 60, 120])).toBeLessThan(1e-6);
    expect(star([30, 120, 210, 300])).toBeGreaterThan(10);
  });

  it("puts no pair of wedges where the two bonds in the page run in one line, and of two pairs takes the closer (`wedgePairs`)", () => {
    const input = fromSmiles("C[C@](F)(Cl)Br");
    const mol = perceive(input);
    const at = (d: number) => ({ x: Math.cos(d * DEG), y: Math.sin(d * DEG) });
    const wedgesFor = (places: [number, number][]) => {
      const pos = new Map<number, { x: number; y: number }>([[1, { x: 0, y: 0 }], ...places.map(([a, d]): [number, { x: number; y: number }] => [a, at(d)])]);
      return placeStereo(mol, pos, new Map([[1, input.atoms[1].tetra!]])).wedges.filter((w) => w.from === 1);
    };
    // (the methyl at 0, F at 60, Cl at 120 and Br at 300: the only pair a sixth apart, F and the methyl, has its two in the page in one line)
    expect(wedgesFor([[0, 0], [2, 60], [3, 120], [4, 300]])).toHaveLength(1);
    // (two pairs closer than the bonds opposite them: the methyl and F, 90 apart; F and Cl, 50 apart - the closer taken)
    const two = wedgesFor([[0, -170], [2, -80], [3, -30], [4, 80]]);
    expect(two.map((w) => w.to).sort()).toEqual([2, 3]);
  });
});
