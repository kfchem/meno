import { describe, expect, it } from "vitest";
import { identity, type IdentityInput } from "../chem/identity";
import { readStereo, type DrawnAtom, type DrawnBond } from "./drawn";
import { layout2D } from "./engine";
import { withRecognisedDepth } from "./recognised";
import { fromSmiles } from "./testdata/fromSmiles";
import { chair, haworth } from "./testdata/projections";
import diastereomers from "./testdata/diastereomers.json";
import cages from "./testdata/cages.json";
import { measured } from "../../testing/timeouts";

/**
 * A chair drawn bond by bond - no depth, no wedge - read as the compound it shows (docs/EDITOR-2D.md, *Drawn in perspective*): the depth worked
 * out from the ring as drawn (lib/chem/perception/projection/recognise), the near and far by the convention (the lower atoms nearer), then
 * the centres read in space as a tool's drawing is read.
 */
const stripped = (d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }) => ({ atoms: d.atoms.map(({ z: _z, centre: _c, ...a }) => a), bonds: d.bonds });

function identityOfDrawing(d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }): string {
  const stereo = readStereo(d.atoms, d.bonds);
  const input: IdentityInput = {
    atoms: d.atoms.map((a, i) => ({ el: a.el ?? "C", hs: a.hs, ...(stereo.tetra.get(i) ? { tetra: stereo.tetra.get(i)! } : {}) })),
    bonds: d.bonds.map((b) => ({ a: b.a, b: b.b, order: b.order })),
  };
  return identity(input).text;
}
const smiles = (s: string) => identity(fromSmiles(s)).text;

describe("a chair drawn bond by bond, read as the compound it shows", () => {
  const trans = [smiles("C[C@@H]1CCCC[C@H]1C"), smiles("C[C@H]1CCCC[C@@H]1C")];
  const cis = smiles("C[C@@H]1CCCC[C@@H]1C");

  it("reads trans-1,2-dimethylcyclohexane diequatorial and diaxial as one compound, and cis-1,2 as the meso compound", () => {
    for (const tilt of [60, 70]) {
      const eq = stripped(chair({ 0: "equatorial", 1: "equatorial" }, tilt));
      const ax = stripped(chair({ 0: "axial", 1: "axial" }, tilt));
      expect(trans, `diequatorial ${tilt}`).toContain(identityOfDrawing(eq));
      expect(trans, `diaxial ${tilt}`).toContain(identityOfDrawing(ax));
      expect(identityOfDrawing(stripped(chair({ 0: "axial", 1: "equatorial" }, tilt))), `cis ${tilt}`).toBe(cis);
    }
  });

  it("reads it by the convention - the lower atoms nearer - as the drawing with that depth stored, and its mirror picture as the mirror compound", () => {
    const groups = { 0: { place: "equatorial" as const, el: "O", hs: 1 }, 1: { place: "equatorial" as const, hs: 1, branches: 2 }, 4: "equatorial" as const };
    // (the test drawing is seen from below - its nearer atoms the higher - so the convention reads it the other way round: its depth reversed)
    const d = chair(groups);
    const seenFromAbove = { atoms: d.atoms.map((a) => (a.z != null ? { ...a, z: -a.z } : a)), bonds: d.bonds };
    expect(identityOfDrawing(stripped(d))).toBe(identityOfDrawing(seenFromAbove));
    expect(identityOfDrawing(stripped(d))).not.toBe(identityOfDrawing(d));
    // (the page mirrored, the lower still nearer: the mirror compound)
    const mirror = chair(groups, 70, "mirrored");
    expect(identityOfDrawing(stripped(mirror))).not.toBe(identityOfDrawing(stripped(d)));
    expect(smiles("CC(C)[C@@H]1CC[C@@H](C)C[C@H]1O") === identityOfDrawing(stripped(d)) || smiles("CC(C)[C@H]1CC[C@H](C)C[C@@H]1O") === identityOfDrawing(stripped(d))).toBe(true);
  });

  it("reads nothing at a chair drawn on its side, with no mark", () => {
    const d = stripped(chair({ 0: "equatorial", 1: "equatorial" }));
    const side = { atoms: d.atoms.map((a) => ({ ...a, x: -a.y, y: a.x })), bonds: d.bonds };
    expect(readStereo(side.atoms, side.bonds).tetra.size).toBe(0);
  });

  it("reads a chair with a bold edge by the mark: the edge nearer", () => {
    const d = stripped(chair({ 0: "equatorial", 1: "equatorial" }));
    // (the upper edge marked bold: seen from below, the mirror of what the convention gives)
    const ring = [0, 1, 2, 3, 4, 5];
    const upper = ring.reduce((best, k) => (d.atoms[k].y + d.atoms[(k + 1) % 6].y > d.atoms[best].y + d.atoms[(best + 1) % 6].y ? k : best), 0);
    const marked = { atoms: d.atoms, bonds: d.bonds.map((b) => (b.a === upper && b.b === (upper + 1) % 6 ? { ...b, bold: true } : b)) };
    expect(identityOfDrawing(marked)).not.toBe(identityOfDrawing(d));
    expect(trans).toContain(identityOfDrawing(marked));
  });

  it("leaves a chair with a wedge as it always was: read by the wedge, no depth worked out", () => {
    const d = stripped(chair({ 0: "equatorial", 1: "equatorial" }));
    const wedged = { atoms: d.atoms, bonds: d.bonds.map((b) => (b.a === 0 && b.b === 6 ? { ...b, wedge: { narrow: 0, stereo: "up" as const } } : b)) };
    expect(withRecognisedDepth(wedged.atoms, wedged.bonds)).toBe(wedged.atoms);
  });
});

describe("a Haworth ring drawn bond by bond, with no depth stored", () => {
  // (McNaught 1996, 2-Carb-5.4: viewed from slightly above, the nearer edge drawn lower; 2-Carb-6.2: OH up at C1 is beta. Brecher 2006, ST-1.9: such a drawing is ambiguous, so the ring is read as one only with its groups vertical, or a near edge marked)
  const beta = "C([C@@H]1[C@H]([C@@H]([C@H]([C@@H](O1)O)O)O)O)O";
  const alpha = "C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O)O)O)O)O";

  it("reads beta-D-glucopyranose as its SMILES, and the alpha anomer as the other structure", () => {
    for (const tilt of [25, 30, 40]) {
      expect(identityOfDrawing(stripped(haworth([true, false, true, false, true], tilt))), `beta ${tilt}`).toBe(smiles(beta));
      expect(identityOfDrawing(stripped(haworth([false, false, true, false, true], tilt))), `alpha ${tilt}`).toBe(smiles(alpha));
    }
  });

  it("needs no ring O at the back: the ring turned over about the page's horizontal - the O now in front, the lower edge still the nearer - is the same compound", () => {
    // (2-Carb-5.5 allows other orientations, the lower edge the nearer in all of them: the page mirrored top to bottom, with the convention's depth, is a half turn of the ring)
    const d = stripped(haworth([true, false, true, false, true], 30));
    const turned = { atoms: d.atoms.map((a) => ({ ...a, y: -a.y })), bonds: d.bonds };
    expect(identityOfDrawing(turned)).toBe(identityOfDrawing(d));
  });

  it("is flat where the groups are not drawn vertical: the flattened ring alone is no Haworth ring", () => {
    const d = stripped(haworth([true, false, true, false, true], 30));
    const slanted = { atoms: d.atoms.map((a, i) => (i >= 6 ? { ...a, x: a.x + 0.9 } : a)), bonds: d.bonds };
    expect(withRecognisedDepth(slanted.atoms, slanted.bonds)).toBe(slanted.atoms);
    // (and no group at all: nothing to read)
    const bare = { atoms: d.atoms.slice(0, 6), bonds: d.bonds.slice(0, 6) };
    expect(withRecognisedDepth(bare.atoms, bare.bonds)).toBe(bare.atoms);
  });

  it("is read by a near edge marked bold, with the groups not vertical, before the convention", () => {
    const d = stripped(haworth([true, false, true, false, true], 30));
    const slanted = d.atoms.map((a, i) => (i >= 6 ? { ...a, x: a.x + 0.9 } : a));
    // (the front edge C2-C3, the lower one on the page: marked bold, it reads as the convention would)
    const marked = d.bonds.map((b) => (b.a === 2 && b.b === 3 ? { ...b, bold: true } : b));
    const got = withRecognisedDepth(slanted, marked);
    expect(got).not.toBe(slanted);
    expect(got[2].z).toBeGreaterThan(0);
    expect(got[3].z).toBeGreaterThan(0);
    // (the back edge marked, the ring is read from below)
    const back = withRecognisedDepth(slanted, d.bonds.map((b) => (b.a === 5 && b.b === 0 ? { ...b, bold: true } : b)));
    expect(back[5].z).toBeGreaterThan(0);
  });

  it("is flat where the lowest ring bond is not level, or a ring atom is not above it, whatever its groups", () => {
    // (a group drawn with its ring atom's x: vertical still)
    const moved = (d: { atoms: DrawnAtom[]; bonds: DrawnBond[] }, by: (a: DrawnAtom, i: number) => { x: number; y: number }) => {
      const at = (i: number) => (i < 6 ? i : d.bonds.find((b) => b.b === i && b.a < 6)?.a ?? i);
      const shifted = d.atoms.map((a, i) => by(a, i));
      return { atoms: d.atoms.map((a, i) => ({ ...a, x: i < 6 ? shifted[i].x : shifted[at(i)].x, y: shifted[i].y })), bonds: d.bonds };
    };
    const d = stripped(haworth([true, false, true, false, true], 30));
    expect(withRecognisedDepth(d.atoms, d.bonds)).not.toBe(d.atoms);
    // (one end of the front edge C2-C3 dropped: the edge slants past LEVEL_EDGE)
    const slanted = moved(d, (a, i) => ({ x: a.x, y: i === 2 ? a.y - 0.5 : a.y }));
    expect(withRecognisedDepth(slanted.atoms, slanted.bonds)).toBe(slanted.atoms);
    // (the ring O, at the back, pulled down below the front edge)
    const sagged = moved(d, (a, i) => ({ x: a.x, y: i === 0 ? d.atoms[2].y - 0.3 : a.y }));
    expect(withRecognisedDepth(sagged.atoms, sagged.bonds)).toBe(sagged.atoms);
  });

  it("leaves a hexagon and a pentagon standing on a corner, and a regular hexagon on an edge with its groups straight up and down, as they are; reads the last with its near edge bold", () => {
    const ring = (n: number, from: number) => [...Array(n)].map((_, k) => ({ x: Math.cos(from + (2 * Math.PI * k) / n), y: Math.sin(from + (2 * Math.PI * k) / n), hs: 1, el: "C" }));
    const drawing = (n: number, from: number) => {
      const atoms = [...ring(n, from), ...ring(n, from).map((a, k) => ({ ...a, y: a.y + (k % 2 ? 1 : -1), hs: 1, el: "O" }))];
      const bonds = [...Array(n)].map((_, k) => ({ a: k, b: (k + 1) % n, order: 1 })).concat([...Array(n)].map((_, k) => ({ a: k, b: n + k, order: 1 })));
      return { atoms, bonds };
    };
    for (const [n, from] of [[6, Math.PI / 6], [5, 0]] as const) {
      const d = drawing(n, from);
      expect(withRecognisedDepth(d.atoms, d.bonds), `${n}`).toBe(d.atoms);
    }
    // (on an edge, every group straight up or down: still a flat drawing that happens to lie so - as tall as a regular ring - and read only with its near edge bold)
    const onEdge = drawing(6, 0);
    expect(withRecognisedDepth(onEdge.atoms, onEdge.bonds)).toBe(onEdge.atoms);
    const marked = onEdge.bonds.map((b, k) => (k === 4 ? { ...b, bold: true } : b));
    expect(withRecognisedDepth(onEdge.atoms, marked)).not.toBe(onEdge.atoms);
  });

  it("reads another of the twelve representations of beta-D-glucopyranose - the ring turned, and turned over - as the same compound, drawn with depth and drawn by hand alike (2-Carb-5.4)", () => {
    for (let turn = 0; turn < 6; turn++)
      for (const over of [false, true]) {
        const d = haworth([true, false, true, false, true], 30, turn);
        // (turned over about the page's horizontal: the lower edge still the nearer, the groups up become down)
        const shown = over ? { atoms: d.atoms.map((a) => ({ ...a, y: -a.y, ...(a.z != null ? { z: -a.z } : {}) })), bonds: d.bonds } : d;
        expect(identityOfDrawing(shown), `with depth, turn ${turn}${over ? ", over" : ""}`).toBe(smiles(beta));
        expect(identityOfDrawing(stripped(shown)), `by hand, turn ${turn}${over ? ", over" : ""}`).toBe(smiles(beta));
      }
  });

});

describe("no drawing the engine makes in the plane is taken for a chair", () => {
  it("leaves every flat ring of the layout fixtures as drawn: nothing is given a depth but what the engine itself drew in perspective", () => {
    const smis = [
      ...diastereomers.molecules.filter((_, i) => i % 4 === 0).map((m) => m.smiles),
      ...Object.values(cages).map((c) => (c as { smiles?: string }).smiles).filter((s): s is string => !!s),
      "C1CCCCC1", "CC1CCC(C)CC1", "OC1CCCCC1O", "C1CCC2CCCCC2C1", "C1CCC2(CC1)CCCCC2", "c1ccccc1C", "C1CCCC(C1)C1CCCCC1", "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O", "C1CC2CCC1C2", "C[C@H]1CC[C@@H](C)CC1",
    ];
    let rings = 0;
    for (const smi of smis) {
      let input;
      try {
        input = fromSmiles(smi);
      } catch {
        continue;
      }
      const out = layout2D(input);
      const atoms: DrawnAtom[] = input.atoms.map((a, i) => ({ x: out.x[i], y: out.y[i], hs: a.hs ?? 0, el: a.el, ...(out.depth[i] != null ? { z: out.depth[i]! } : {}) }));
      const bonds: DrawnBond[] = input.bonds.map(({ a, b, order }) => ({ a, b, order }));
      const read = withRecognisedDepth(atoms, bonds);
      rings += 1;
      // (nothing given a depth that had none)
      expect(read.every((a, i) => a.z === atoms[i].z), smi).toBe(true);
    }
    expect(rings).toBeGreaterThan(20);
  }, measured(20_000));
});
