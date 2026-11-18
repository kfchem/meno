import { describe, expect, it } from "vitest";
import { MENO } from "../../../../lib/chem/style";
import type { ChemClient } from "../../../../lib/roles/client";
import { readStereo } from "../../../../lib/layout/drawn";
import type { Model } from "../store/types";
import { drawingOf } from "./drawing";
import { formulaOf, runsGivenIn3d } from "./make3d";

// A molecule in 3D drawn as a formula: its allenes' axes and odd cumulenes' cis or trans are its places', which the plugin's MOL block
// cannot carry - given to the layout, not drawn open (as a run nothing gives is) nor as the plugin's picture shows it by chance.

type Atom3 = { el: string; x: number; y: number; z: number };

/**
 * Hexa-2,3,4-triene in 3D, its run along x, all bonds single (as a file of coordinates gives them): C1's groups a methyl up and an H down,
 * C4's methyl down (trans) or up (cis) - in the order `hFirst` (each end's H numbered before its methyl; "C1": C1's alone) or not.
 */
function triene(cis: boolean, hFirst: boolean | "C1"): { atoms: Atom3[]; bonds: { a1: number; a2: number; order: number }[] } {
  const named: Record<string, Atom3> = {
    me1: { el: "C", x: -0.7, y: 1.1, z: 0 },
    h1: { el: "H", x: -0.7, y: -1.1, z: 0 },
    c1: { el: "C", x: 0, y: 0, z: 0 },
    c2: { el: "C", x: 1.3, y: 0, z: 0 },
    c3: { el: "C", x: 2.6, y: 0, z: 0 },
    c4: { el: "C", x: 3.9, y: 0, z: 0 },
    me4: { el: "C", x: 4.6, y: cis ? 1.1 : -1.1, z: 0 },
    h4: { el: "H", x: 4.6, y: cis ? -1.1 : 1.1, z: 0 },
  };
  const order = [...(hFirst ? ["h1", "me1"] : ["me1", "h1"]), "c1", "c2", "c3", "c4", ...(hFirst === true ? ["h4", "me4"] : ["me4", "h4"])];
  const at = (n: string) => order.indexOf(n);
  const pairs = [["me1", "c1"], ["h1", "c1"], ["c1", "c2"], ["c2", "c3"], ["c3", "c4"], ["c4", "me4"], ["c4", "h4"]];
  return { atoms: order.map((n) => named[n]), bonds: pairs.map(([p, q]) => ({ a1: at(p), a2: at(q), order: 1 })) };
}

/** Its heavy atoms as the plugin draws them, in their order: bent one way, its bonds' orders found. */
function pictureOf(m: { atoms: Atom3[]; bonds: { a1: number; a2: number }[] }, orders: Record<string, number>): Model {
  const heavy = m.atoms.flatMap((a, i) => (a.el === "H" ? [] : [i]));
  const id = (i: number) => heavy.indexOf(i) + 1;
  const flat = [
    [-0.75, 1.3],
    [0, 0],
    [1.5, 0],
    [3, 0],
    [4.5, 0],
    [5.25, 1.3],
  ];
  // (the heavy atoms in their order are me1, c1, c2, c3, c4, me4 - or, H first, the same: each H drops out)
  return {
    atoms: heavy.map((i, k) => ({ id: k + 1, el: m.atoms[i].el, x: flat[k][0], y: flat[k][1] })),
    bonds: m.bonds.filter((b) => m.atoms[b.a1].el !== "H" && m.atoms[b.a2].el !== "H").map((b, k) => ({ id: 100 + k, a: id(b.a1), b: id(b.a2), order: orders[`${id(b.a1)},${id(b.a2)}`] ?? 1 })),
  } as Model;
}

const ORDERS = { "2,3": 2, "3,4": 2, "4,5": 2 };

describe("a molecule in 3D's odd cumulene, drawn as a formula", () => {
  const given = (cis: boolean, hFirst: boolean | "C1") => {
    const m = triene(cis, hFirst);
    const drawn = pictureOf(m, ORDERS);
    const at: (number | null)[] = [];
    let k = 0;
    for (const a of m.atoms) at.push(a.el === "H" ? null : k++);
    return runsGivenIn3d({ ...m, bonds: m.bonds }, 0, drawn, at);
  };

  it("is given as its places have it, by the drawing's atoms: trans and cis, an H numbered first at each end, at one, or at none", () => {
    for (const hFirst of [false, true, "C1"] as const) {
      for (const cis of [false, true]) {
        const g = given(cis, hFirst);
        expect(g?.cumulated, `${cis} ${hFirst}`).toHaveLength(1);
        const run = g!.cumulated[0];
        expect([...run.atoms].sort(), `${cis} ${hFirst}`).toEqual([1, 4]);
        // (each end's methyl: the drawing's atoms 0 and 5)
        expect([...run.refs].sort(), `${cis} ${hFirst}`).toEqual([0, 5]);
        expect(run.cis, `${cis} ${hFirst}`).toBe(cis);
      }
    }
  });

  it("is drawn so through formulaOf, from the plugin's picture bent the other way", async () => {
    for (const cis of [false, true]) {
      const m = triene(cis, "C1");
      // (the plugin's picture: both methyls up, cis, whatever the places say)
      const picture = pictureOf(m, ORDERS);
      const block = toMolblock(picture);
      const chem = { request: async () => ({ molblock: block, perceived: true }) } as unknown as ChemClient;
      const molecule = { id: 1, at: { x: 0, y: 0 }, atoms: m.atoms, bonds: m.bonds, wholeWithoutH: false };
      const { model } = await formulaOf(chem, molecule as never, 0, MENO);
      const d = drawingOf(model);
      expect(readStereo(d.atoms, d.bonds).cumulated.map((r) => r.cis), `${cis}`).toEqual([cis]);
    }
  }, 60000);
});

describe("a molecule in 3D's allene, drawn as a formula", () => {
  /** Penta-2,3-diene in 3D: C1's groups in the page's plane, C3's across it - in the order `hFirst` or not. */
  const allene = (hFirst: boolean | "C1", mirrored: boolean) => {
    const s = mirrored ? -1 : 1;
    const named: Record<string, Atom3> = {
      me1: { el: "C", x: -0.7, y: 1.1, z: 0 },
      h1: { el: "H", x: -0.7, y: -1.1, z: 0 },
      c1: { el: "C", x: 0, y: 0, z: 0 },
      c2: { el: "C", x: 1.3, y: 0, z: 0 },
      c3: { el: "C", x: 2.6, y: 0, z: 0 },
      me3: { el: "C", x: 3.3, y: 0, z: 1.1 * s },
      h3: { el: "H", x: 3.3, y: 0, z: -1.1 * s },
    };
    const order = [...(hFirst ? ["h1", "me1"] : ["me1", "h1"]), "c1", "c2", "c3", ...(hFirst === true ? ["h3", "me3"] : ["me3", "h3"])];
    const at = (n: string) => order.indexOf(n);
    const pairs = [["me1", "c1"], ["h1", "c1"], ["c1", "c2"], ["c2", "c3"], ["c3", "me3"], ["c3", "h3"]];
    return { atoms: order.map((n) => named[n]), bonds: pairs.map(([p, q]) => ({ a1: at(p), a2: at(q), order: 1 })) };
  };
  const senseOf = (hFirst: boolean | "C1", mirrored: boolean) => {
    const m = allene(hFirst, mirrored);
    const heavy = m.atoms.flatMap((a, i) => (a.el === "H" ? [] : [i]));
    const drawn = {
      atoms: heavy.map((_, k) => ({ id: k + 1, el: "C", x: k, y: 0 })),
      bonds: [
        { id: 1, a: 1, b: 2, order: 1 },
        { id: 2, a: 2, b: 3, order: 2 },
        { id: 3, a: 3, b: 4, order: 2 },
        { id: 4, a: 4, b: 5, order: 1 },
      ],
    } as Model;
    const at: (number | null)[] = [];
    let k = 0;
    for (const a of m.atoms) at.push(a.el === "H" ? null : k++);
    const g = runsGivenIn3d(m, 0, drawn, at);
    expect(g?.axes).toHaveLength(1);
    expect([...g!.axes[0].refs].sort()).toEqual([0, 4]);
    return g!.axes[0].sense;
  };

  it("is given the same axis whichever group is numbered first, and the other for its mirror image", () => {
    for (const mirrored of [false, true]) for (const hFirst of [true, "C1"] as const) expect(senseOf(hFirst, mirrored), `${hFirst} ${mirrored}`).toBe(senseOf(false, mirrored));
    expect(senseOf(false, true)).toBe(-senseOf(false, false));
  });
});

/** A MOL block of a drawing's atoms and bonds, as a plugin gives one: V2000, its places in the page. */
function toMolblock(m: Model): string {
  const index = new Map(m.atoms.map((a, i) => [a.id, i + 1]));
  const pad = (s: string | number, n: number) => String(s).padStart(n);
  const atoms = m.atoms.map((a) => `${pad(a.x.toFixed(4), 10)}${pad(a.y.toFixed(4), 10)}${pad("0.0000", 10)} ${(a.el ?? "C").padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
  const bonds = m.bonds.map((b) => `${pad(index.get(b.a)!, 3)}${pad(index.get(b.b)!, 3)}${pad(b.order, 3)}  0`);
  return ["", "  Meno", "", `${pad(m.atoms.length, 3)}${pad(m.bonds.length, 3)}  0  0  0  0  0  0  0  0999 V2000`, ...atoms, ...bonds, "M  END", ""].join("\n");
}
