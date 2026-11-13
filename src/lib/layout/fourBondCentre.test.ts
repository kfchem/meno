import { describe, expect, it } from "vitest";
import { layout2D, type Layout2D } from "./engine";
import type { LayoutInput } from "./perceive";
import { drawnVolume } from "./stereo";
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
