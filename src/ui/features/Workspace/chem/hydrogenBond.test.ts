import { describe, expect, it } from "vitest";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { readStereo } from "../../../../lib/layout/drawn";
import { MENO } from "../../../../lib/chem/style";
import type { Bond, Model } from "../store/types";
import { laidOut } from "./cleanUp";
import { cipMarksOf } from "./cipMarks";
import { drawingOf } from "./drawing";
import { layoutJob } from "./engineLayout";
import { identityInputOf, identityOfDrawn } from "./identityOf";

// A hydrogen bond drawn (a file's type 10, dotted) is no bond of the structure: it closes no ring, joins no two molecules, and is laid out
// and drawn as before.
const L = NOMINAL_BOND_LENGTH;
const atom = (id: number, [x, y]: [number, number], el = "C") => ({ id, x: x * L, y: y * L, r: 0.9, el });
const bond = (id: number, a: number, b: number, order: 1 | 2 = 1, extra: Partial<Bond> = {}): Bond => ({ id, a, b, order, ...extra });
const polar = (deg: number, r = 1): [number, number] => [r * Math.cos((deg * Math.PI) / 180), -r * Math.sin((deg * Math.PI) / 180)];

/** (Z)-4-hydroxypent-3-en-2-one, flat, its O-H...O=C hydrogen bond closing a hexagon when `hBond`: C2 2, C3 4, C4 5, O 6, H 8, O 3. */
function enol(hBond: boolean): Model {
  return {
    atoms: [atom(1, polar(150, 2)), atom(2, polar(150)), atom(3, polar(-150), "O"), atom(4, polar(90)), atom(5, polar(30)), atom(6, polar(-30), "O"), atom(7, polar(30, 2)), atom(8, polar(-90), "H")],
    bonds: [bond(11, 1, 2), bond(12, 2, 3, 2), bond(13, 2, 4), bond(14, 4, 5, 2), bond(15, 5, 6), bond(16, 5, 7), bond(17, 6, 8), ...(hBond ? [bond(18, 8, 3, 1, { hydrogen: true })] : [])],
  };
}

/** Water, drawn apart from `m` or bonded to its H `h` by a hydrogen bond. */
function withWater(m: Model, h: number, hBond: boolean): Model {
  const at = m.atoms.find((a) => a.id === h)!;
  return {
    atoms: [...m.atoms, { ...atom(90, [0, 0], "O"), x: at.x + 0.9 * L, y: at.y + 0.9 * L }],
    bonds: [...m.bonds, ...(hBond ? [bond(91, h, 90, 1, { hydrogen: true })] : [])],
  };
}

describe("a hydrogen bond drawn", () => {
  it("leaves the enol one identity, with its C=C read Z, drawn or not", () => {
    const [without, drawn] = [enol(false), enol(true)].map(identityOfDrawn);
    expect(drawn.text).toBe(without.text);
    expect(drawn.complete).toBe(true);
    const ct = identityInputOf(enol(true)).input.bonds.filter((b) => b.stereo);
    expect(ct).toHaveLength(1);
  });

  it("joins no two molecules: the enol and a water it binds are two parts, the identity of the two drawn apart", () => {
    const apart = identityOfDrawn(withWater(enol(true), 8, false)).text;
    const bound = identityOfDrawn(withWater(enol(true), 8, true)).text;
    expect(bound).toBe(apart);
    expect(identityInputOf(withWater(enol(true), 8, true)).input.bonds).toHaveLength(7);
  });

  it("gives the enol's C=C the same Z, drawn or not - the hydrogen bond first among the bonds too", () => {
    const shown = (m: Model): Model => ({ atoms: m.atoms.map((a) => ({ ...a, stereoShown: true })), bonds: m.bonds.map((b) => ({ ...b, stereoShown: true })) });
    const first = enol(true);
    const hFirst: Model = { ...first, bonds: [first.bonds[first.bonds.length - 1], ...first.bonds.slice(0, -1)] };
    for (const m of [enol(false), enol(true), hFirst]) expect([...cipMarksOf(shown(m)).doubleBonds]).toEqual([[14, "Z"]]);
    expect(identityInputOf(hFirst).bondAt).toEqual([-1, 0, 1, 2, 3, 4, 5, 6]);
  });

  it("gives a centre the same R or S with a hydrogen bond to its OH's H: (R)- or (S)-butan-2-ol and a water", () => {
    const butanol: Model = {
      atoms: [atom(1, [0, 0]), atom(2, polar(210)), atom(3, polar(-30)), atom(4, [polar(-30)[0] + 0.87, polar(-30)[1] - 0.5]), atom(5, polar(90), "O"), atom(6, [0.87, -1.5], "H")],
      bonds: [bond(11, 1, 2), bond(12, 1, 3), bond(13, 3, 4), bond(14, 1, 5, 1, { stereo: "up" }), bond(15, 5, 6)],
    };
    const label = (m: Model) => [...cipMarksOf({ atoms: m.atoms.map((a) => ({ ...a, stereoShown: true })), bonds: m.bonds }).centres];
    expect(label(butanol)).toHaveLength(1);
    expect(label(withWater(butanol, 6, true))).toEqual(label(butanol));
    expect(identityOfDrawn(withWater(butanol, 6, true)).text).toBe(identityOfDrawn(withWater(butanol, 6, false)).text);
  });

  it("is laid out by Clean-up as before - kept, a bond the engine is given - and the C=C read Z before and after, nothing refused", async () => {
    const m = enol(true);
    expect(layoutJob(m).input.bonds).toHaveLength(8);
    const read = (x: Model) => {
      const d = drawingOf(x);
      return [...readStereo(d.atoms, d.bonds).cisTrans].map(([k, c]) => [x.bonds[k].id, c.cis]);
    };
    expect(read(m)).toEqual([[14, true]]);
    const out = await laidOut(m, MENO);
    expect(out.bonds.find((b) => b.id === 18)?.hydrogen).toBe(true);
    expect(read(out)).toEqual([[14, true]]);
  });
});

describe("a hydrogen bond to an amine's N", () => {
  // (N,N-ethylmethylpropan-1-amine's N, a wedge on its bond to the methyl, and a water's H bonded to its lone pair)
  const amine = (hBond: boolean): Model => ({
    atoms: [atom(1, [0, 0], "N"), atom(2, polar(90)), atom(3, polar(210)), atom(4, polar(330)), atom(5, [polar(210)[0] - 0.87, polar(210)[1] - 0.5]), atom(6, [polar(330)[0] + 0.87, polar(330)[1] - 0.5]), atom(7, [polar(330)[0] + 1.73, polar(330)[1]]), atom(8, polar(270, 1.1), "H"), atom(9, polar(270, 2.1), "O")],
    bonds: [bond(11, 1, 2, 1, { stereo: "up" }), bond(12, 1, 3), bond(13, 1, 4), bond(14, 3, 5), bond(15, 4, 6), bond(16, 6, 7), bond(17, 8, 9), ...(hBond ? [bond(18, 8, 1, 1, { hydrogen: true })] : [])],
  });

  it("leaves it three bonds, keeping no configuration: its wedge states none, drawn or not, and the two are two parts", () => {
    for (const hBond of [false, true]) {
      const { input, unread } = identityInputOf(amine(hBond));
      expect(input.atoms[0].tetra, `${hBond}`).toBeUndefined();
      expect(unread, `${hBond}`).toEqual([1]);
    }
    expect(identityOfDrawn(amine(true)).text).toBe(identityOfDrawn(amine(false)).text);
  });
});

describe("a hydrogen bond to an ether's O", () => {
  it("adds no bond round it: a wedge narrow at the O is no stereocentre's whose wedges say nothing, drawn or not", () => {
    // (diethyl ether's O with a wedge narrow at it - a bond of two, no centre - and a water's H bonded to it)
    const ether = (hBond: boolean): Model => ({
      atoms: [atom(1, [0, 0], "O"), atom(2, polar(210)), atom(3, polar(330)), atom(4, [polar(210)[0] - 0.87, polar(210)[1] + 0.5]), atom(5, [polar(330)[0] + 0.87, polar(330)[1] + 0.5]), atom(6, polar(90, 1.1), "H"), atom(7, polar(90, 2.1), "O")],
      bonds: [bond(11, 1, 2, 1, { stereo: "up" }), bond(12, 1, 3), bond(13, 2, 4), bond(14, 3, 5), bond(15, 6, 7), ...(hBond ? [bond(16, 6, 1, 1, { hydrogen: true })] : [])],
    });
    expect(identityInputOf(ether(false)).unread).toEqual([]);
    expect(identityInputOf(ether(true)).unread).toEqual([]);
  });
});
