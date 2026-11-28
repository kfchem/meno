import { describe, expect, it } from "vitest";
import { identityInputOf, identityOfDrawn } from "../chem/identityOf";
import type { Model } from "../store/types";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { chairsIn } from "./chair";
import { sameStereo } from "../chem/engineLayout";
import { CHAIR_CHANGED, chairFromFlat, flatRingOf, type FromFlat, groupKind, NOT_DRAWN } from "./fromFlat";
import { measured } from "../../../../testing/timeouts";
import { cipMarksOf } from "../chem/cipMarks";

// *Draw as chair* (docs/EDITOR-2D.md, *Projections*): the known answers of the brief, each a flat drawing of a SMILES as Clean-up draws it.

/** `m` with what *Draw as chair* on the ring through atom `id` changes put in. */
function asChair(m: Model, id: number): Model {
  const made = chairFromFlat(m, id);
  if (!made || "refused" in made) throw new Error(made ? made.refused : "not offered");
  const atoms = new Map(made.atoms.map((a) => [a.id, a]));
  const bonds = new Map(made.bonds.map((b) => [b.id, b]));
  return { atoms: m.atoms.map((a) => atoms.get(a.id) ?? a), bonds: m.bonds.map((b) => bonds.get(b.id) ?? b) };
}

/** The ring atoms of a drawing's chair and, for each of their groups that is no H, whether it stands axial: straight up or down from its atom. */
function axialOf(m: Model): { axial: number; equatorial: number } {
  const all = new Set(m.atoms.map((a) => a.id));
  const [ring] = chairsIn(m, all);
  const inRing = new Set(ring);
  const at = new Map(m.atoms.map((a) => [a.id, a]));
  let axial = 0;
  let equatorial = 0;
  for (const b of m.bonds) {
    const [r, g] = inRing.has(b.a) && !inRing.has(b.b) ? [b.a, b.b] : inRing.has(b.b) && !inRing.has(b.a) ? [b.b, b.a] : [null, null];
    if (r == null || g == null || at.get(g)!.el === "H") continue;
    if (Math.abs(at.get(g)!.x - at.get(r)!.x) < 1e-6) axial++;
    else equatorial++;
  }
  return { axial, equatorial };
}

/** A SMILES drawn flat, drawn as a chair from its ring atom `id`, and checked: a chair of the tool's, the same compound. */
function drawn(smiles: string, id = 1) {
  const flat = drawnFromSmiles(smiles);
  const chair = asChair(flat, id);
  expect(chairsIn(chair, new Set(chair.atoms.map((a) => a.id))), smiles).toHaveLength(1);
  const [was, now] = [identityOfDrawn(flat), identityOfDrawn(chair)];
  expect(now.text, smiles).toBe(was.text);
  return { flat, chair, ...axialOf(chair) };
}

describe("a flat six-ring drawn as a chair (Draw as chair)", () => {
  it("draws cyclohexane as a chair, and methylcyclohexane with its methyl equatorial", () => {
    expect(drawn("C1CCCCC1")).toMatchObject({ axial: 0, equatorial: 0 });
    expect(drawn("CC1CCCCC1", 2)).toMatchObject({ axial: 0, equatorial: 1 });
  }, measured(1000));

  it("draws trans-1,2-dimethylcyclohexane diequatorial and cis-1,2 one axial, one equatorial, each the compound it was", () => {
    expect(drawn("C[C@@H]1CCCC[C@H]1C", 2)).toMatchObject({ axial: 0, equatorial: 2 });
    expect(drawn("C[C@H]1CCCC[C@H]1C", 2)).toMatchObject({ axial: 1, equatorial: 1 });
  }, measured(1000));

  it("draws cis-1,3-dimethylcyclohexane diequatorial, trans-1,4 diequatorial and cis-1,4 one of each", () => {
    expect(drawn("C[C@@H]1CCC[C@H](C)C1", 2)).toMatchObject({ axial: 0, equatorial: 2 });
    expect(drawn("C[C@H]1CC[C@H](C)CC1", 2)).toMatchObject({ axial: 0, equatorial: 2 });
    expect(drawn("C[C@@H]1CC[C@H](C)CC1", 2)).toMatchObject({ axial: 1, equatorial: 1 });
  }, measured(1000));

  /** Every writing of a ring SMILES whose `n` marks `{}` each take @ or @@. */
  const writings = (smiles: string, n: number) =>
    Array.from({ length: 2 ** n }, (_, k) => {
      let j = 0;
      return smiles.replace(/\{\}/g, () => ((k >> j++) & 1 ? "@@" : "@"));
    });
  /** The writings grouped by the compound the flat drawing is, each group's chairs' axial and equatorial groups. */
  const byCompound = (all: string[]) => {
    const groups = new Map<string, { axial: number; equatorial: number }[]>();
    for (const w of all) {
      const d = drawn(w, 2);
      const key = identityOfDrawn(d.flat).text;
      groups.set(key, [...(groups.get(key) ?? []), { axial: d.axial, equatorial: d.equatorial }]);
    }
    return [...groups.values()].sort((p, q) => p.length - q.length);
  };

  it("draws every writing of 1,3,5-trimethylcyclohexane as the compound it is: all-cis all equatorial, cis,trans one axial", () => {
    const [allCis, cisTrans] = byCompound(writings("C[C{}H]1C[C{}H](C)C[C{}H](C)C1", 3));
    expect(allCis).toEqual(Array(2).fill({ axial: 0, equatorial: 3 }));
    expect(cisTrans).toEqual(Array(6).fill({ axial: 1, equatorial: 2 }));
  }, measured(4000));

  it("draws every writing of 1,3,5-cyclohexanetriol likewise: all-cis's three OH equatorial, cis,trans one axial", () => {
    const [allCis, cisTrans] = byCompound(writings("O[C{}H]1C[C{}H](O)C[C{}H](O)C1", 3));
    expect(allCis).toEqual(Array(2).fill({ axial: 0, equatorial: 3 }));
    expect(cisTrans).toEqual(Array(6).fill({ axial: 1, equatorial: 2 }));
  }, measured(4000));

  it("draws 1,3,5-cyclohexanetriol with one centre open as the compound drawn, however it is written: the configurations that set nothing taken out lowest rank first", () => {
    // (an OH centre left open: which of the two given ones then sets nothing depends on the order they are asked in)
    for (const w of ["C1[C@H](O)C[C@@H](O)C[CH](O)1", "[C@@H]1(O)C[C@@H](O)C[CH](O)C1", "C1[C@@H](O)C[C@H](O)C[CH](O)1"]) drawn(w, 1);
  }, measured(2000));

  it("draws every writing of 1,2,4,5-tetramethylcyclohexane as the compound drawn", () => {
    const groups = byCompound(writings("C[C{}H]1C[C{}H](C)[C{}H](C)C[C{}H]1C", 4));
    expect(groups.flat()).toHaveLength(16);
  }, measured(8000));

  it("draws every writing of the inositols as the compound drawn: the nine stereoisomers, scyllo's six OH equatorial", () => {
    const groups = byCompound(writings("O[C{}H]1[C{}H](O)[C{}H](O)[C{}H](O)[C{}H](O)[C{}H]1O", 6));
    expect(groups).toHaveLength(9);
    expect(groups.flat()).toHaveLength(64);
    // (scyllo: every OH trans to its neighbours - all six equatorial in its chair)
    expect(groups.flat().filter((g) => g.axial === 0 && g.equatorial === 6).length).toBeGreaterThan(0);
  }, measured(30000));

  it("draws (-)-menthol with its three groups equatorial, the same compound", () => {
    expect(drawn("CC(C)[C@@H]1CC[C@@H](C)C[C@H]1O", 4)).toMatchObject({ axial: 0, equatorial: 3 });
  }, measured(1000));

  it("draws scyllo-inositol with no OH axial and myo-inositol - scyllo with one centre turned - with one", () => {
    // (scyllo: every two neighbouring OHs trans; turned at its first centre, myo's one cis pair - its C-2 OH)
    expect(drawn("O[C@H]1[C@H](O)[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O", 2)).toMatchObject({ axial: 0, equatorial: 6 });
    expect(drawn("O[C@@H]1[C@H](O)[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O", 2)).toMatchObject({ axial: 1, equatorial: 5 });
  }, measured(1000));

  it("draws beta-D-glucopyranose with every group equatorial, its ring O behind and C-1 at the right-hand end; the alpha anomer its C-1 OH axial", () => {
    const beta = drawn("OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O", 3);
    expect(beta).toMatchObject({ axial: 0, equatorial: 5 });
    const at = new Map(beta.chair.atoms.map((a) => [a.id, a]));
    // (the ring O, atom 4, and C-1, atom 5: C-1 the rightmost ring atom, the O behind it - farther than C-1's other ring neighbour, C-2, atom 7)
    const ring = [3, 4, 5, 7, 9, 11];
    expect(Math.max(...ring.map((i) => at.get(i)!.x))).toBeCloseTo(at.get(5)!.x, 9);
    expect(at.get(4)!.z!).toBeLessThan(at.get(7)!.z!);
    expect(drawn("OC[C@H]1O[C@H](O)[C@H](O)[C@@H](O)[C@@H]1O", 3)).toMatchObject({ axial: 1, equatorial: 4 });
  }, measured(1000));

  it("draws a centre the drawing leaves open with its group equatorial on a wavy bond, read open as before", () => {
    // (2-methylcyclohexanol with only the OH's centre given: the methyl's carbon, atom 2, open)
    const { flat, chair } = drawn("CC1CCCC[C@H]1O", 2);
    const wavy = chair.bonds.filter((b) => b.stereo === "wavy");
    expect(wavy.map((b) => [b.a, b.b].sort())).toEqual([[1, 2]]);
    expect(identityOfDrawn(chair).text).toBe(identityOfDrawn(flat).text);
    // (read on the chair, as on the flat drawing: the OH's carbon, atom 7, a configuration; the methyl's, atom 2, open)
    for (const m of [flat, chair]) {
      const { input } = identityInputOf(m);
      const index = new Map(m.atoms.map((a, i) => [a.id, i]));
      expect([!!input.atoms[index.get(7)!].tetra, !!input.atoms[index.get(2)!].tetra]).toEqual([true, false]);
    }
  }, measured(1000));

  it("draws 4-methylcyclohexanol with a wedge on its OH alone - which sets nothing - with its methyl on a wavy bond, read as nothing given before and after", () => {
    const plain = drawnFromSmiles("CC1CCC(O)CC1");
    const o = plain.atoms.find((a) => a.el === "O")!;
    const co = plain.bonds.find((b) => b.a === o.id || b.b === o.id)!;
    const c = co.a === o.id ? co.b : co.a;
    const flat: Model = { ...plain, bonds: plain.bonds.map((b) => (b === co ? { ...b, stereo: "up" as const, narrow: c } : b)) };
    const chair = asChair(flat, c);
    const methyl = plain.atoms.find((a) => a.el === "C" && plain.bonds.filter((b) => b.a === a.id || b.b === a.id).length === 1)!;
    const wavy = chair.bonds.filter((b) => b.stereo === "wavy");
    expect(wavy.map((b) => (b.a === methyl.id ? b.a : b.b === methyl.id ? b.b : -1))).toEqual([methyl.id]);
    // (the wedge sets nothing: drawn up or down, one structure; and the chair is that structure, whichever way the wedge went - the
    //  plain drawing is another writing of the same thing unsaid, which identity may write apart: lib/chem/identity `filledIn`)
    const down: Model = { ...plain, bonds: plain.bonds.map((b) => (b === co ? { ...b, stereo: "down" as const, narrow: c } : b)) };
    const nothing = identityOfDrawn(flat).text;
    expect(identityOfDrawn(down).text).toBe(nothing);
    expect(identityOfDrawn(chair).text).toBe(nothing);
    expect(identityOfDrawn(asChair(down, c)).text).toBe(nothing);
  }, measured(1000));

  it("is not offered where the ring's centres have no configuration drawn, and says why; nor on a ring it does not draw", () => {
    expect(chairFromFlat(drawnFromSmiles("CC1CCCCC1O"), 2)).toEqual({ refused: NOT_DRAWN });
    // (ring atoms that are centres only together - two on one ring are cis or trans to each other: 1,4-dimethylcyclohexane,
    //  4-tert-butylcyclohexanol, scyllo-inositol, none with a wedge)
    expect(chairFromFlat(drawnFromSmiles("CC1CCC(C)CC1"), 2)).toEqual({ refused: NOT_DRAWN });
    expect(chairFromFlat(drawnFromSmiles("CC(C)(C)C1CCC(O)CC1"), 5)).toEqual({ refused: NOT_DRAWN });
    expect(chairFromFlat(drawnFromSmiles("OC1C(O)C(O)C(O)C(O)C1O"), 2)).toEqual({ refused: NOT_DRAWN });
    expect(chairFromFlat(drawnFromSmiles("O=C1CCCCC1"), 2)).toBeNull();
    expect(chairFromFlat(drawnFromSmiles("C1=CCCCC1"), 1)).toBeNull();
    expect(chairFromFlat(drawnFromSmiles("C1CCC2CCCC2C1"), 1)).toBeNull();
  }, measured(1000));
});

describe("the conventions, whichever way the flat drawing lies", () => {
  /** A flat drawing turned half round, mirrored, or both. */
  const lying = (m: Model, k: number): Model => ({ ...m, atoms: m.atoms.map((a) => ({ ...a, x: k & 1 ? -a.x : a.x, y: k & 2 ? -a.y : a.y })) });

  it("lays a 2,6-dimethoxyoxane as any ring - both carbons beside its O carry one - not as a pyranose: as near the flat drawing as it can", () => {
    for (const smiles of ["CO[C@H]1CCC[C@@H](OC)O1", "CO[C@H]1CCC[C@H](OC)O1"]) {
      const flat = drawnFromSmiles(smiles);
      const ring = chairsIn(asChair(flat, 3), new Set(flat.atoms.map((a) => a.id)))[0];
      // (the ring atom at the right-hand end, at each lying: with the pyranose rule it would be the same carbon every time)
      const rightmost = new Set(
        [0, 1, 2, 3].map((k) => {
          const chair = asChair(lying(flat, k), 3);
          const at = new Map(chair.atoms.map((a) => [a.id, a]));
          return ring.reduce((m, r) => (at.get(r)!.x > at.get(m)!.x ? r : m));
        }),
      );
      expect(rightmost.size, smiles).toBeGreaterThan(1);
    }
  }, measured(1000));

  it("lays a pyranose's ring with C-1 at the right-hand end and its ring O behind, however the flat drawing lies", () => {
    const flat = drawnFromSmiles("OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O");
    for (let k = 0; k < 4; k++) {
      const chair = asChair(lying(flat, k), 3);
      const at = new Map(chair.atoms.map((a) => [a.id, a]));
      const ring = [3, 4, 5, 7, 9, 11];
      expect(Math.max(...ring.map((i) => at.get(i)!.x)), `${k}`).toBeCloseTo(at.get(5)!.x, 9);
      expect(at.get(4)!.z!, `${k}`).toBeLessThan(at.get(7)!.z!);
    }
  }, measured(1000));

  it("puts, of a chair either way with as many groups axial, the larger group equatorial: cis-4-tert-butylcyclohexanol's tert-butyl, its OH axial, however the drawing lies", () => {
    const flat = drawnFromSmiles("CC(C)(C)[C@@H]1CC[C@H](O)CC1");
    for (let k = 0; k < 4; k++) {
      const chair = asChair(lying(flat, k), 5);
      expect(axialOf(chair), `${k}`).toMatchObject({ axial: 1, equatorial: 1 });
      const at = new Map(chair.atoms.map((a) => [a.id, a]));
      const o = chair.atoms.find((a) => a.el === "O")!;
      const co = chair.bonds.find((b) => b.a === o.id || b.b === o.id)!;
      const c = at.get(co.a === o.id ? co.b : co.a)!;
      // (the OH straight up or down from its carbon: axial)
      expect(Math.abs(at.get(o.id)!.x - c.x), `${k}`).toBeLessThan(1e-6);
    }
  }, measured(1000));

  it("reads a group typed as a label as the atoms it holds: cis-1-tert-butyl-4-isopropylcyclohexane with its tBu a label puts it equatorial, as drawn out", () => {
    // (the tert-butyl's carbon and its three methyls made one label, "tBu", where they stood)
    const flat = drawnFromSmiles("CC(C)(C)[C@@H]1CC[C@H](C(C)C)CC1");
    const quaternary = flat.atoms.find((a) => a.el === "C" && flat.bonds.filter((b) => b.a === a.id || b.b === a.id).length === 4)!;
    const methyls = new Set(flat.bonds.flatMap((b) => (b.a === quaternary.id ? [b.b] : b.b === quaternary.id ? [b.a] : [])).filter((n) => flat.bonds.filter((b) => b.a === n || b.b === n).length === 1));
    expect(methyls.size).toBe(3);
    const labelled: Model = {
      atoms: flat.atoms.filter((a) => !methyls.has(a.id)).map((a) => (a.id === quaternary.id ? { ...a, el: "tBu" } : a)),
      bonds: flat.bonds.filter((b) => !methyls.has(b.a) && !methyls.has(b.b)),
    };
    const ringAtom = labelled.bonds.find((b) => b.a === quaternary.id || b.b === quaternary.id)!;
    const r = ringAtom.a === quaternary.id ? ringAtom.b : ringAtom.a;
    for (const m of [flat, labelled]) {
      const chair = asChair(m, r);
      const at = new Map(chair.atoms.map((a) => [a.id, a]));
      // (the tert-butyl's first atom not straight up or down from its ring atom: equatorial; the isopropyl axial)
      expect(Math.abs(at.get(quaternary.id)!.x - at.get(r)!.x), m === flat ? "drawn out" : "label").toBeGreaterThan(1e-6);
      expect(axialOf(chair), m === flat ? "drawn out" : "label").toMatchObject({ axial: 1, equatorial: 1 });
    }
  }, measured(1000));

  it("reads an OH typed as a label as its O: cis-2-methoxycyclohexanol with its OH a label puts the OH axial and the OMe equatorial, as drawn out", () => {
    const flat = drawnFromSmiles("O[C@H]1CCCC[C@H]1OC");
    // (the hydroxyl's O, bonded to a ring carbon and nothing else, written as the label "OH")
    const ringOf = (id: number) => flat.bonds.find((b) => b.a === id || b.b === id)!;
    const hydroxyl = flat.atoms.find((a) => a.el === "O" && flat.bonds.filter((b) => b.a === a.id || b.b === a.id).length === 1)!;
    const labelled: Model = { ...flat, atoms: flat.atoms.map((a) => (a.id === hydroxyl.id ? { ...a, el: "OH" } : a)) };
    const bond = ringOf(hydroxyl.id);
    const r = bond.a === hydroxyl.id ? bond.b : bond.a;
    for (const m of [flat, labelled]) {
      const chair = asChair(m, r);
      const at = new Map(chair.atoms.map((a) => [a.id, a]));
      // (the OH straight up or down from its ring atom: axial; the OMe equatorial)
      expect(Math.abs(at.get(hydroxyl.id)!.x - at.get(r)!.x), m === flat ? "drawn out" : "label").toBeLessThan(1e-6);
      expect(axialOf(chair), m === flat ? "drawn out" : "label").toMatchObject({ axial: 1, equatorial: 1 });
    }
  }, measured(1000));

  it("puts, of a chair either way with as many groups axial and alike in size, the group whose first atom ranks lowest equatorial - the same, however the drawing lies", () => {
    // (cis-2-methylcyclohexanol: one group axial in either chair, the methyl and the OH each of one non-hydrogen atom)
    const flat = drawnFromSmiles("C[C@H]1CCCC[C@H]1O");
    const axialGroup = (m: Model) => {
      const at = new Map(m.atoms.map((a) => [a.id, a]));
      const ring = new Set(chairsIn(m, new Set(m.atoms.map((a) => a.id)))[0]);
      const b = m.bonds.find((x) => ring.has(x.a) !== ring.has(x.b) && Math.abs(at.get(x.a)!.x - at.get(x.b)!.x) < 1e-6)!;
      return ring.has(b.a) ? b.b : b.a;
    };
    const seen = new Set([0, 1, 2, 3].map((k) => axialGroup(asChair(lying(flat, k), 2))));
    expect(seen.size).toBe(1);
  }, measured(1000));
});

describe("Draw as chair on a page", () => {
  /** A page holding the flat drawing of `smiles`. */
  async function page(smiles: string) {
    const { createWorkspaceDocument } = await import("../document");
    const { connectStoreToDocument, createEditorStore } = await import("../store");
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    store.getState().pasteModel(drawnFromSmiles(smiles));
    return { doc, store, st: () => store.getState() };
  }

  it("is one step, undone whole; Flip chair then draws the other chair - trans-1,2-dimethylcyclohexane diaxial - and Draw flat a flat drawing, the compound the same throughout", async () => {
    const { doc, store, st } = await page("C[C@@H]1CCCC[C@H]1C");
    const flat = doc.getState().model;
    const was = identityOfDrawn(flat).text;
    const ring = flat.atoms.find((a) => a.el === "C" && flat.bonds.filter((b) => b.a === a.id || b.b === a.id).length === 3)!;
    const made = chairFromFlat(flat, ring.id);
    expect(made && !("refused" in made)).toBe(true);
    const depth = doc.history().undoDepth;
    expect(st().drawAsChair(made as Exclude<typeof made, null | { refused: string }>)).toBeNull();
    expect(doc.history().undoDepth).toBe(depth + 1);
    expect(doc.history().undoLabel).toBe("draw as chair");
    expect(axialOf(doc.getState().model)).toMatchObject({ axial: 0, equatorial: 2 });
    expect(identityOfDrawn(doc.getState().model).text).toBe(was);
    // (Flip chair: diaxial, the same compound)
    const { flipOf } = await import("./flip");
    const all = new Set(doc.getState().model.atoms.map((a) => a.id));
    const flip = flipOf(doc.getState().model, all);
    expect(flip && "moves" in flip).toBe(true);
    st().placeSolid((flip as { moves: { id: number; x: number; y: number; z?: number }[] }).moves, "flip chair");
    expect(axialOf(doc.getState().model)).toMatchObject({ axial: 2, equatorial: 0 });
    expect(identityOfDrawn(doc.getState().model).text).toBe(was);
    // (Draw flat: no depth, the compound the same)
    const { cleanUp } = await import("../chem/cleanUp");
    await cleanUp(store, null, true);
    expect(doc.getState().model.atoms.every((a) => a.z == null)).toBe(true);
    expect(identityOfDrawn(doc.getState().model).text).toBe(was);
    // (undone to the flat drawing it started from)
    doc.undo();
    doc.undo();
    doc.undo();
    expect(doc.getState().model.atoms.every((a) => a.z == null)).toBe(true);
    expect(identityOfDrawn(doc.getState().model).text).toBe(was);
  }, measured(3000));

  it("changes nothing, and says why, where the chair would read as another compound (the guard)", async () => {
    const { doc, st } = await page("C[C@@H]1CCCC[C@H]1C");
    const flat = doc.getState().model;
    const ring = flat.atoms.find((a) => a.el === "C" && flat.bonds.filter((b) => b.a === a.id || b.b === a.id).length === 3)!;
    const made = chairFromFlat(flat, ring.id) as Exclude<ReturnType<typeof chairFromFlat>, null | { refused: string }>;
    // (the chair's depth turned about, as a fault of Meno's might: the other enantiomer - the guard refuses)
    const bad = { atoms: made.atoms.map((a) => (a.z != null ? { ...a, z: -a.z } : a)), bonds: made.bonds };
    const depth = doc.history().undoDepth;
    expect(st().drawAsChair(bad)).toBe(CHAIR_CHANGED);
    expect(doc.history().undoDepth).toBe(depth);
    expect(doc.getState().model).toBe(flat);
  }, measured(3000));

  it("changes nothing where the chair would state a configuration the drawing leaves open: one gained is a difference too", async () => {
    // (2-methylcyclohexanol with only the OH's centre given; the chair made with the methyl's wavy bond left off states the methyl's)
    const { doc, st } = await page("CC1CCCC[C@H]1O");
    const flat = doc.getState().model;
    const ring = flat.atoms.find((a) => a.el === "C" && flat.bonds.filter((b) => b.a === a.id || b.b === a.id).length === 3)!;
    const made = chairFromFlat(flat, ring.id) as Exclude<ReturnType<typeof chairFromFlat>, null | { refused: string }>;
    expect(made.bonds.some((b) => b.stereo === "wavy")).toBe(true);
    const bad = { atoms: made.atoms, bonds: made.bonds.map(({ stereo: _s, ...b }) => b) };
    const depth = doc.history().undoDepth;
    expect(st().drawAsChair(bad)).toBe(CHAIR_CHANGED);
    expect(doc.history().undoDepth).toBe(depth);
    expect(doc.getState().model).toBe(flat);
  }, measured(3000));
});

describe("which chair, by the kind of each group (published conformational energies, A-values: their order only)", () => {
  const lying = (m: Model, k: number): Model => ({ ...m, atoms: m.atoms.map((a) => ({ ...a, x: k & 1 ? -a.x : a.x, y: k & 2 ? -a.y : a.y })) });
  /** Of a chair, whether the group bound through atom `g` stands axial: straight up or down from its ring atom. */
  const axialAt = (m: Model, g: number) => {
    const ring = new Set(chairsIn(m, new Set(m.atoms.map((a) => a.id)))[0]);
    const b = m.bonds.find((x) => (x.a === g && ring.has(x.b)) || (x.b === g && ring.has(x.a)))!;
    const r = b.a === g ? b.b : b.a;
    const at = new Map(m.atoms.map((a) => [a.id, a]));
    return Math.abs(at.get(g)!.x - at.get(r)!.x) < 1e-6;
  };
  /** A cis-1,4 pair, the group `first` written before the ring and `second` on it: the first group's atom bound to the ring, and the drawing. */
  const pair = (first: string, second: string) => {
    const smiles = `${first}[C@@H]1CC[C@H](${second})CC1`;
    const flat = drawnFromSmiles(smiles);
    // (atoms numbered as the SMILES writes them: the first group's come first, the ring's first atom after them - and the one of the
    //  group's bound to it)
    const firstRing = drawnFromSmiles(first).atoms.length + 1;
    const g = flat.bonds.flatMap((x) => (x.a === firstRing && x.b < firstRing ? [x.b] : x.b === firstRing && x.a < firstRing ? [x.a] : []))[0];
    return { smiles, flat, g, ringAtom: firstRing };
  };

  it("puts the first of each cis-1,4 pair equatorial and the second axial, however the flat drawing lies", () => {
    const cases: [string, string][] = [
      ["C", "Cl"],
      ["C", "Br"],
      ["C", "F"],
      ["C", "OS(=O)(=O)c2ccc(C)cc2"],
      ["C", "C#N"],
      ["C", "O"],
      // (an O-first group against a C-first one: the methyl equatorial, though OMe and OAc have more atoms)
      ["C", "OC"],
      ["C", "OC(C)=O"],
      ["CC(C)(C)", "OS(=O)(=O)c2ccc(C)cc2"],
      ["CC(C)(C)", "O"],
      ["CC(C)", "C"],
      ["CC", "C"],
      ["c2ccccc2", "C"],
      ["c2ccccc2", "F"],
      ["N", "O"],
      ["OC(=O)", "O"],
      ["C", "C(=O)OC"],
      ["C", "O[Si](C)(C)C(C)(C)C"],
      ["CC(C)(C)", "O[Si](C)(C)C(C)(C)C"],
      ["CC(C)(C)", "OC(=O)c2ccccc2"],
      // (the cases that must not come out wrong)
      ["CO", "C#N"],
      ["O", "C#C"],
    ];
    for (const [first, second] of cases) {
      const { smiles, flat, g, ringAtom } = pair(first, second);
      for (let k = 0; k < 4; k++) {
        const chair = asChair(lying(flat, k), ringAtom);
        expect(axialOf(chair), `${smiles} ${k}`).toMatchObject({ axial: 1 });
        expect(axialAt(chair, g), `${smiles} ${k}: the first group axial`).toBe(false);
      }
    }
  }, measured(3000));

  it("puts an axial tert-butyl after any count of small groups axial; a CF3 by its kind among the rest", () => {
    // (1-tert-butyl-2,5-difluoro, and its dimethyl relative: the tert-butyl equatorial, the two others axial)
    for (const smiles of ["CC(C)(C)[C@H]1[C@@H](F)CC[C@H](F)C1", "CC(C)(C)[C@H]1[C@@H](C)CC[C@H](C)C1"]) {
      const flat = drawnFromSmiles(smiles);
      const chair = asChair(flat, 5);
      expect(axialAt(chair, 2), smiles).toBe(false);
      expect(axialOf(chair), smiles).toMatchObject({ axial: 2 });
    }
    // (the same with a CF3 in the tert-butyl's place: no tertiary alkyl, so the fewer axial - the CF3 axial, the methyls equatorial)
    const cf3 = asChair(drawnFromSmiles("FC(F)(F)[C@H]1[C@@H](C)CC[C@H](C)C1"), 5);
    expect(axialAt(cf3, 2)).toBe(true);
    expect(axialOf(cf3)).toMatchObject({ axial: 1 });
  }, measured(3000));

  it("counts as a tertiary alkyl a tert-butyl only: a trimethylsilyl, or a carbon with a fluorine among its three, goes by its kind", () => {
    // (each in the tert-butyl's place of the case above: no tertiary alkyl, so the fewer axial - it axial, the methyls equatorial)
    for (const first of ["C[Si](C)(C)", "CC(C)(F)"]) {
      const chair = asChair(drawnFromSmiles(`${first}[C@H]1[C@@H](C)CC[C@H](C)C1`), drawnFromSmiles(first).atoms.length + 1);
      expect(axialOf(chair), first).toMatchObject({ axial: 1 });
    }
  }, measured(3000));

  it("of groups of one kind, puts the larger equatorial, written either way - where the first atoms' ranks would say the other", () => {
    // (each group as written before the ring - bound through its last atom - and on it: a propyl against a chloromethyl, an SMe against
    //  an OH, a methyl ester against an acetyl)
    const groups: [[string, string], [string, string]][] = [
      [["CCC", "CCC"], ["ClC", "CCl"]],
      [["CS", "SC"], ["O", "O"]],
      [["COC(=O)", "C(=O)OC"], ["CC(=O)", "C(C)=O"]],
    ];
    for (const [larger, smaller] of groups) {
      for (const [first, second, firstLarger] of [[larger[0], smaller[1], true], [smaller[0], larger[1], false]] as const) {
        const { smiles, flat, g, ringAtom } = pair(first, second);
        for (let k = 0; k < 4; k++) {
          const chair = asChair(lying(flat, k), ringAtom);
          expect(axialAt(chair, g), `${smiles} ${k}`).toBe(!firstLarger);
        }
      }
    }
  }, measured(3000));

  it("compares two chairs' axial groups by their kinds, the largest first: two vinyls axial before a phenyl and a hydroxyl", () => {
    // (a 1,2,4,5-tetrasubstituted ring whose one chair has the two vinyls axial and the other the phenyl and the hydroxyl - the chair
    //  the published conformational energies (A-values) favour too, the phenyl and the hydroxyl together the larger)
    const smiles = "C=C[C@H]1[C@@H](c2ccccc2)C[C@@H](O)[C@@H](C=C)C1";
    const flat = drawnFromSmiles(smiles);
    for (let k = 0; k < 4; k++) {
      const chair = asChair(lying(flat, k), 3);
      // (the phenyl's first C and the O, numbered as the SMILES writes them: atoms 5 and 13)
      const phenyl = { id: 5 };
      const hydroxyl = { id: 13 };
      expect([flat.atoms.find((a) => a.id === 5)!.el, flat.atoms.find((a) => a.id === 13)!.el]).toEqual(["C", "O"]);
      expect(axialAt(chair, phenyl.id), `${smiles} ${k}: the phenyl`).toBe(false);
      expect(axialAt(chair, hydroxyl.id), `${smiles} ${k}: the hydroxyl`).toBe(false);
      expect(axialOf(chair), `${smiles} ${k}`).toMatchObject({ axial: 2 });
    }
  }, measured(3000));

  it("by the kinds where the sizes would say the other: cis-4-methylcyclohexanecarbaldehyde's formyl axial, of two atoms, before its methyl, of one", () => {
    // (a formyl's kind (2) is smaller than a methyl's (3), its non-hydrogen atoms more: the kinds decide, as the published
    //  conformational energies (A-values) do - the formyl's the smaller)
    const smiles = "O=C[C@H]1CC[C@@H](C)CC1";
    const flat = drawnFromSmiles(smiles);
    expect([flat.atoms.find((a) => a.id === 2)!.el, flat.atoms.find((a) => a.id === 7)!.el]).toEqual(["C", "C"]);
    for (let k = 0; k < 4; k++) {
      const chair = asChair(lying(flat, k), 3);
      expect(axialAt(chair, 2), `${smiles} ${k}: the formyl`).toBe(true);
      expect(axialAt(chair, 7), `${smiles} ${k}: the methyl`).toBe(false);
    }
  }, measured(3000));
});

describe("a group's kind on a ring, by the atom bound to it", () => {
  it("is as the table has it, each kind's examples - and the default for an atom it does not name", () => {
    // (each group on cyclohexane's atom 1 - written first, so its atom bound to the ring is the one before the ring's first atom)
    const kind = (first: string) => {
      const m = drawnFromSmiles(`${first}C1CCCCC1`);
      const ring = drawnFromSmiles(first).atoms.length + 1;
      const x = m.bonds.flatMap((b) => (b.a === ring && b.b < ring ? [b.b] : b.b === ring && b.a < ring ? [b.a] : []))[0];
      // (the phenyl's ring carbons aromatic, as the core's rule reads them)
      const aromatic = new Set(first.startsWith("c") ? m.atoms.filter((a) => a.id < ring).map((a) => a.id) : []);
      return groupKind(m, x, ring, aromatic);
    };
    const table: [string, number][] = [
      ["CC(C)(C)", 5],
      ["FC(F)(F)", 5],
      ["CC(C)", 4],
      ["c2ccccc2", 4],
      ["C[Si](C)(C)", 4],
      ["c2ccccc2S(=O)(=O)", 4],
      ["C", 3],
      ["CC", 3],
      ["BrC", 3],
      ["C=C", 2],
      ["OC(=O)", 2],
      ["N", 2],
      ["CN(C)", 2],
      ["[O-][N+](=O)", 2],
      ["c2ccccc2S(=O)", 2],
      ["O", 1],
      ["CO", 1],
      ["CC(=O)O", 1],
      ["S", 1],
      ["CS", 1],
      ["F", 0],
      ["Cl", 0],
      ["Br", 0],
      ["I", 0],
      ["N#C", 0],
      ["C#C", 0],
      ["[C-]#[N+]", 0],
      ["O=C=N", 0],
      ["Cl[Hg]", 0],
      // (an N whose one other neighbour is a non-carbon by a double bond - a nitroso, an azide: the default)
      ["O=N", 2],
      ["[N-]=[N+]=N", 2],
      // (an atom the table does not name: the default, with no measured basis)
      ["CP(C)", 2],
      ["OB(O)", 2],
    ];
    for (const [first, k] of table) expect(kind(first), first).toBe(k);
  }, measured(3000));
});

describe("Draw as chair as the page draws it: offered only where the page then draws it, and Draw flat back", () => {
  /** A page holding `flat`, its atom ids kept. */
  async function page(flat: Model) {
    const { createWorkspaceDocument } = await import("../document");
    const { connectStoreToDocument, createEditorStore } = await import("../store");
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    doc.edit("the flat drawing", (d) => ({ ...d, model: flat, nextId: Math.max(...flat.atoms.map((a) => a.id), ...flat.bonds.map((b) => b.id)) + 1 }));
    return { doc, store };
  }
  /** `m` with the bonds from ring atom `at` to `up` and `down` a wedge and a hash, their narrow ends at `at`. */
  const wedged = (m: Model, at: number, up: number, down: number): Model => ({
    ...m,
    bonds: m.bonds.map((b) => {
      const other = b.a === at ? b.b : b.b === at ? b.a : null;
      return other === up ? { ...b, stereo: "up" as const, narrow: at } : other === down ? { ...b, stereo: "down" as const, narrow: at } : b;
    }),
  });
  /** The ring atom of `m` with four neighbours drawn, and its two groups off the ring. */
  const carrying = (m: Model) => {
    const at = m.atoms.find((a) => m.bonds.filter((b) => b.a === a.id || b.b === a.id).length === 4)!.id;
    const ring = new Set(flatRingOf(m, at));
    const groups = m.bonds.flatMap((b) => (b.a === at ? [b.b] : b.b === at ? [b.a] : [])).filter((n) => !ring.has(n));
    return { at, groups };
  };

  /** *Draw as chair* offered on the ring through `id` and drawn by the page; then *Draw flat*: each the compound it was, each atom's wedges kept. */
  async function chairAndBack(flat: Model, id: number) {
    const made = chairFromFlat(flat, id);
    expect(made && !("refused" in made) ? "offered" : made, "offered").toBe("offered");
    const { doc, store } = await page(flat);
    expect(store.getState().drawAsChair(made as FromFlat), "drawn by the page").toBeNull();
    const chair = doc.getState().model;
    expect(chairsIn(chair, new Set(chair.atoms.map((a) => a.id)))).toHaveLength(1);
    expect(identityOfDrawn(chair).text).toBe(identityOfDrawn(flat).text);
    expect(sameStereo(flat, chair), "each ring atom's groups on the faces the flat drawing says").toBe(true);
    const { cleanUp } = await import("../chem/cleanUp");
    await cleanUp(store, null, true);
    const back = doc.getState().model;
    expect(back.atoms.every((a) => a.z == null), "laid flat").toBe(true);
    expect(identityOfDrawn(back).text, "Draw flat: the same compound").toBe(identityOfDrawn(flat).text);
    return { chair, back, ...axialOf(chair) };
  }

  /** Each centre's R or S, by atom id, every atom asked. */
  const descriptors = (m: Model) => [...cipMarksOf({ ...m, atoms: m.atoms.map((a) => ({ ...a, stereoShown: true })) }).centres].sort((p, q) => p[0] - q[0]);
  /** `m` with the bond from `centre` to `to` a wedge (`up`) or a hash, narrow at `centre`; every other wedge taken off. */
  const wedgeAt = (m: Model, centre: number, to: number, stereo: "up" | "down"): Model => ({
    ...m,
    bonds: m.bonds.map(({ stereo: _s, narrow: _n, ...b }) => ((b.a === centre && b.b === to) || (b.b === centre && b.a === to) ? { ...b, stereo, narrow: centre } : b)),
  });
  /** *Draw as chair*, *Flip chair* and *Draw flat* on the page, each centre's descriptor read after each the same as in the flat drawing. */
  async function throughFlip(flat: Model, id: number) {
    const was = descriptors(flat);
    expect(was.length, "the flat drawing states a centre").toBeGreaterThan(0);
    const made = chairFromFlat(flat, id);
    expect(made && !("refused" in made) ? "offered" : made, "offered").toBe("offered");
    const { doc, store } = await page(flat);
    expect(store.getState().drawAsChair(made as FromFlat), "drawn by the page").toBeNull();
    const chair = doc.getState().model;
    expect(chairsIn(chair, new Set(chair.atoms.map((a) => a.id)))).toHaveLength(1);
    expect(descriptors(chair), "the chair").toEqual(was);
    const first = axialOf(chair);
    const { flipOf } = await import("./flip");
    const flip = flipOf(chair, new Set(chair.atoms.map((a) => a.id)));
    expect(flip && "moves" in flip ? "flipped" : flip, "Flip chair").toBe("flipped");
    store.getState().placeSolid((flip as { moves: { id: number; x: number; y: number; z?: number }[] }).moves, "flip chair");
    const flipped = doc.getState().model;
    expect(descriptors(flipped), "the flipped chair").toEqual(was);
    expect(identityOfDrawn(flipped).text).toBe(identityOfDrawn(flat).text);
    // (each ring atom's groups from axial to equatorial and back: as many axial now as were equatorial)
    expect(axialOf(flipped)).toEqual({ axial: first.equatorial, equatorial: first.axial });
    const { cleanUp } = await import("../chem/cleanUp");
    await cleanUp(store, null, true);
    const back = doc.getState().model;
    expect(back.atoms.every((a) => a.z == null), "laid flat").toBe(true);
    expect(identityOfDrawn(back).text, "Draw flat: the same compound").toBe(identityOfDrawn(flat).text);
    expect(descriptors(back), "Draw flat").toEqual(was);
    return { chair, flipped, first };
  }
  /** The atom of `m` of element `el` bound to three atoms drawn, an O among them: a CH(OH) centre. */
  const carbinol = (m: Model) => {
    const near = (x: number) => m.bonds.flatMap((b) => (b.a === x ? [b.b] : b.b === x ? [b.a] : []));
    const el = new Map(m.atoms.map((a) => [a.id, a.el]));
    const c = m.atoms.find((a) => a.el === "C" && near(a.id).length === 3 && near(a.id).some((n) => el.get(n) === "O"))!.id;
    return { c, o: near(c).find((n) => el.get(n) === "O")!, near };
  };

  it("draws a ring with a centre beside it, its wedge on the bond to the ring and narrow at that centre, either way, as a chair: the centre's configuration kept through Flip chair and Draw flat", async () => {
    // (1-cyclohexylethanol: the ring's one group equatorial, then axial; the centre off the ring R or S as drawn throughout - greyed before)
    const plain = drawnFromSmiles("CC(O)C1CCCCC1");
    const { c, near } = carbinol(plain);
    const ringAtom = near(c).find((n) => flatRingOf(plain, n))!;
    for (const stereo of ["up", "down"] as const) {
      const flat = wedgeAt(plain, c, ringAtom, stereo);
      const { chair, first } = await throughFlip(flat, ringAtom);
      expect(first, stereo).toEqual({ axial: 0, equatorial: 1 });
      // (the wedge kept, narrow at the centre it belongs to)
      expect(chair.bonds.find((b) => (b.a === c && b.b === ringAtom) || (b.b === c && b.a === ringAtom))).toMatchObject({ stereo, narrow: c });
    }
  }, measured(10000));

  it("draws the same ring with the centre's wedge on its bond to the OH, either way: Flip chair keeps the centre's configuration", async () => {
    const plain = drawnFromSmiles("CC(O)C1CCCCC1");
    const { c, o, near } = carbinol(plain);
    const ringAtom = near(c).find((n) => flatRingOf(plain, n))!;
    for (const stereo of ["up", "down"] as const) {
      const { first } = await throughFlip(wedgeAt(plain, c, o, stereo), ringAtom);
      expect(first, stereo).toEqual({ axial: 0, equatorial: 1 });
    }
  }, measured(10000));

  it("draws a ring whose centre is two bonds off it - 1-cyclohexylpropan-2-ol, wedged either way - the centre's configuration kept throughout", async () => {
    const plain = drawnFromSmiles("CC(O)CC1CCCCC1");
    const { c, o } = carbinol(plain);
    const ringAtom = plain.atoms.find((a) => flatRingOf(plain, a.id) && plain.bonds.filter((b) => b.a === a.id || b.b === a.id).length === 3)!.id;
    for (const stereo of ["up", "down"] as const) {
      const { first } = await throughFlip(wedgeAt(plain, c, o, stereo), ringAtom);
      expect(first, stereo).toEqual({ axial: 0, equatorial: 1 });
    }
  }, measured(10000));

  it("draws a ring whose atom is a centre carrying a centre - trans-1-(2-methylcyclohexyl)ethanol, either centre off the ring - diequatorial, then diaxial, every descriptor kept", async () => {
    for (const s of ["C[C@@H](O)[C@@H]1CCCC[C@H]1C", "C[C@H](O)[C@@H]1CCCC[C@H]1C"]) {
      const flat = drawnFromSmiles(s);
      const ringAtom = flat.atoms.find((a) => flatRingOf(flat, a.id) && flat.bonds.filter((b) => b.a === a.id || b.b === a.id).length === 3)!.id;
      const { first } = await throughFlip(flat, ringAtom);
      expect(descriptors(flat), s).toHaveLength(3);
      expect(first, s).toEqual({ axial: 0, equatorial: 2 });
    }
  }, measured(12000));

  it("draws a ring carbon with a wedge and a hash on two alike groups - no centre - either way round, each group on the face its wedge says", async () => {
    // (2,2-, 3,3- and 4,4-dimethyloxane and 1,1-dimethylcyclohexane: one methyl axial, one equatorial, in any chair; offered, then
    //  refused by the page before - half of these drawings came out with the two methyls the other way up)
    for (const s of ["CC1(C)CCCCO1", "CC1(C)CCCOC1", "CC1(C)CCOCC1", "CC1(C)CCCCC1"]) {
      const plain = drawnFromSmiles(s);
      const { at, groups } = carrying(plain);
      for (const [up, down] of [groups, [...groups].reverse()]) {
        const flat = wedged(plain, at, up, down);
        const { chair } = await chairAndBack(flat, at);
        expect(axialOf(chair), s).toMatchObject({ axial: 1, equatorial: 1 });
        // (the chair says which methyl is up: the one wedged, not the one hashed)
        expect(sameStereo(wedged(plain, at, down, up), chair), s).toBe(false);
      }
    }
  }, measured(20000));

  it("draws a 4-ethyl-4-methyloxane wedged either way with the larger ethyl equatorial: the chair whose up place is equatorial at C-4 for the up group", async () => {
    const plain = drawnFromSmiles("CC1(CC)CCOCC1");
    const { at, groups } = carrying(plain);
    const ethyl = groups.find((g) => plain.bonds.filter((b) => b.a === g || b.b === g).length === 2)!;
    for (const [up, down] of [groups, [...groups].reverse()]) {
      const { chair } = await chairAndBack(wedged(plain, at, up, down), at);
      const p = new Map(chair.atoms.map((a) => [a.id, a]));
      // (axial: straight up or down from its ring atom; the ethyl not so)
      expect(Math.abs(p.get(ethyl)!.x - p.get(at)!.x)).toBeGreaterThan(1e-6);
    }
  }, measured(8000));

  it("draws plain rings whose ring carbons carry one group or two alike, no centre among them, with no configuration read in the chair", async () => {
    // (methylcyclohexane, cyclohexanol, 4-methyloxane, 2,2-dimethyloxane, 1,1,4,4-tetramethylcyclohexane: refused by the page before -
    //  the chair read a configuration at each such carbon the flat drawing did not state)
    // (each with its groups axial as a chemist counts them: none for one group, one of each alike pair)
    for (const [s, id, axial] of [["CC1CCCCC1", 2, 0], ["OC1CCCCC1", 2, 0], ["CC1CCOCC1", 2, 0], ["CC1(C)CCCCO1", 2, 1], ["CC1(C)CCC(C)(C)CC1", 2, 2]] as const) {
      const { chair } = await chairAndBack(drawnFromSmiles(s), id);
      expect(axialOf(chair).axial, s).toBe(axial);
    }
  }, measured(12000));

  it("draws 2-ethyl-2-methyloxane, either enantiomer, as the compound drawn, its two groups one axial and one equatorial", async () => {
    for (const s of ["C[C@]1(CC)CCCCO1", "C[C@@]1(CC)CCCCO1"]) {
      const { chair } = await chairAndBack(drawnFromSmiles(s), 2);
      expect(axialOf(chair), s).toMatchObject({ axial: 1, equatorial: 1 });
    }
  }, measured(6000));

  it("draws 2,3- and 2,6-dimethyloxane, cis and trans: trans-2,3 and cis-2,6 diequatorial, cis-2,3 and trans-2,6 one axial", async () => {
    // (written as trans- and cis-1,2- and cis- and trans-1,3-dimethylcyclohexane are, the ring O in a CH2's place)
    expect(await chairAndBack(drawnFromSmiles("C[C@@H]1OCCC[C@H]1C"), 2)).toMatchObject({ axial: 0, equatorial: 2 });
    expect(await chairAndBack(drawnFromSmiles("C[C@H]1OCCC[C@H]1C"), 2)).toMatchObject({ axial: 1, equatorial: 1 });
    expect(await chairAndBack(drawnFromSmiles("C[C@@H]1CCC[C@H](C)O1"), 2)).toMatchObject({ axial: 0, equatorial: 2 });
    expect(await chairAndBack(drawnFromSmiles("C[C@H]1CCC[C@H](C)O1"), 2)).toMatchObject({ axial: 1, equatorial: 1 });
  }, measured(12000));

  it("draws a cyclohexane carbon with a wedge and a hash beside a centre - 1-ethyl-1,2-dimethylcyclohexane, both diastereomers - as the compound drawn", async () => {
    for (const s of ["C[C@]1(CC)CCCC[C@@H]1C", "C[C@@]1(CC)CCCC[C@@H]1C"]) {
      const { chair } = await chairAndBack(drawnFromSmiles(s), 2);
      expect(axialOf(chair).axial + axialOf(chair).equatorial, s).toBe(3);
    }
  }, measured(6000));

  it("draws a pyranose-like ring with a wedge and a hash on its C-1 and four centres more as the compound drawn: beta-D-glucopyranose with a methyl on C-1", async () => {
    // (beta-D-glucopyranose's SMILES with C-1's H a methyl: its OH on C-1 and every other group as in glucose)
    const { chair } = await chairAndBack(drawnFromSmiles("OC[C@H]1O[C@@](C)(O)[C@H](O)[C@@H](O)[C@@H]1O"), 3);
    expect(axialOf(chair)).toMatchObject({ axial: 1, equatorial: 5 });
  }, measured(6000));

  it("draws a 1,3,5-ring with a tert-butyl and two OH, one OH open, as the compound drawn: the given OH on the face its wedge says", async () => {
    // (refused before: the given OH sets nothing without the open one, and was put by its size, not by its wedge)
    const { chair } = await chairAndBack(drawnFromSmiles("C1[CH](O)C[C@H](C(C)(C)C)C[C@@H](O)1"), 1);
    expect(chair.bonds.filter((b) => b.stereo === "wavy")).toHaveLength(1);
  }, measured(6000));
});
