import { describe, expect, it } from "vitest";
import { flatCost, smallestSets } from "./cage";
import { layout2D, layoutFlat } from "./engine";
import { perceive, type LayoutInput, type Molecule, type RingSystem } from "./perceive";
import { drawnRingSets, MOST_SETS_TRIED, ringSetsToTry, withRingSet } from "./ringSets";
import { placeRingSystem } from "./ringSystem";
import { fromSmiles } from "./testdata/fromSmiles";

const ibogaine = "CC[C@H]1C[C@@H]2C[C@@H]3[C@H]1N(C2)CCC4=C3NC5=C4C=C(C=C5)OC";

const largest = (mol: Molecule) => mol.systems.reduce((b, s) => (s.atoms.length > b.atoms.length ? s : b));
const keyOf = (r: readonly number[]) => [...r].sort((p, q) => p - q).join(",");
const ringsOfSystem = (mol: Molecule, sys: RingSystem) => sys.rings.map((i) => keyOf(mol.rings[i])).sort();

/** The molecule with a system's rings another smallest set, its systems fresh objects: as though perceived so. */
const givenAs = (mol: Molecule, sys: RingSystem, set: readonly (readonly number[])[]) => {
  const m = withRingSet(mol, sys, set);
  return { ...m, systems: m.systems.map((s) => ({ atoms: [...s.atoms], rings: [...s.rings] })) };
};

/** A system laid flat, as the layout lays it (each set tried afresh: none kept from choosing). */
const layFlat = (mol: Molecule, sys: RingSystem) => layoutFlat({ ...mol }, sys);

describe("the smallest set of rings a bridged system is drawn from", () => {
  it("is the same whichever set the system was given - ibogaine's isoquinuclidine two of its three six-membered cycles", () => {
    const mol = perceive(fromSmiles(ibogaine));
    const sys = largest(mol);
    const sets = ringSetsToTry(mol, sys);
    expect(sets.length).toBe(3);
    const chosen = sets.map((set) => {
      const given = givenAs(mol, sys, set);
      const out = drawnRingSets(given, layFlat);
      const outSys = largest(out);
      return { rings: ringsOfSystem(out, outSys), pos: layFlat(out, outSys).pos };
    });
    // (each set given in turn: the same rings chosen, and the same drawing laid from them)
    for (const c of chosen) {
      expect(c.rings).toEqual(chosen[0].rings);
      for (const [a, p] of chosen[0].pos) {
        expect(c.pos.get(a)!.x).toBeCloseTo(p.x, 9);
        expect(c.pos.get(a)!.y).toBeCloseTo(p.y, 9);
      }
    }
    // (and that drawing the best of those laid from each set)
    const costs = sets.map((set) => {
      const m = givenAs(mol, sys, set);
      const s = largest(m);
      return flatCost(m, s, layFlat(m, s).pos, undefined, true);
    });
    const out = drawnRingSets(mol, layFlat);
    expect(flatCost(out, largest(out), chosen[0].pos, undefined, true)).toBeCloseTo(Math.min(...costs), 9);
    expect(Math.max(...costs)).toBeGreaterThan(Math.min(...costs) + 1);
  });

  it("is read by a measure the set it was laid from does not change: the room for its bonds out", () => {
    const mol = perceive(fromSmiles(ibogaine));
    const sys = largest(mol);
    const pos = placeRingSystem(mol, sys);
    const costs = ringSetsToTry(mol, sys).map((set) => {
      const m = givenAs(mol, sys, set);
      return flatCost(m, largest(m), pos, undefined, true);
    });
    for (const c of costs) expect(c).toBeCloseTo(costs[0], 9);
  });

  it("is tried among at most eight sets, those whose rings are bridged across one another least", () => {
    // two bridgeheads joined by four two-carbon bridges: six six-membered
    // cycles, sixteen smallest sets of three - four with one bridge common
    // to all three rings, twelve a chain of rings each sharing a bridge with the next
    const bonds: [number, number][] = [];
    for (const [p, q] of [[2, 3], [4, 5], [6, 7], [8, 9]]) bonds.push([0, p], [p, q], [q, 1]);
    const input: LayoutInput = { atoms: Array.from({ length: 10 }, () => ({ el: "C" })), bonds: bonds.map(([a, b]) => ({ a, b, order: 1 })) };
    const mol = perceive(input);
    const sys = mol.systems[0];
    expect(smallestSets(mol, sys).length).toBe(16);
    const tried = ringSetsToTry(mol, sys);
    expect(tried.length).toBe(MOST_SETS_TRIED);
    const bridgedPairs = (set: number[][]) =>
      set.flatMap((r, j) => set.filter((q, k) => k > j && q.filter((a) => r.includes(a)).length >= 3)).length;
    for (const set of tried) expect(bridgedPairs(set)).toBe(2);
    // (and the system drawn the same however its atoms are listed)
    const reversed: LayoutInput = { atoms: input.atoms, bonds: input.bonds.map(({ a, b, order }) => ({ a: 9 - a, b: 9 - b, order })) };
    const shape = (l: { x: number[]; y: number[] }) => {
      const d = l.x.flatMap((_, i) => l.x.map((_, j) => Math.round(Math.hypot(l.x[i] - l.x[j], l.y[i] - l.y[j]) * 1000))).sort((p, q) => p - q);
      return d.join(",");
    };
    expect(shape(layout2D(reversed))).toBe(shape(layout2D(input)));
  });

  it("lays ibogaine flat, its isoquinuclidine from the two cycles that leave it room", () => {
    const out = layout2D(fromSmiles(ibogaine));
    expect(out.solid.some(Boolean)).toBe(false);
  });
});
