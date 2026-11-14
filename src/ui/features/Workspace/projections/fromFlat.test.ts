import { describe, expect, it } from "vitest";
import { identityInputOf, identityOfDrawn } from "../chem/identityOf";
import type { Model } from "../store/types";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { chairsIn } from "./chair";
import { CHAIR_CHANGED, chairFromFlat, groupKind, NOT_DRAWN } from "./fromFlat";
import { measured } from "../../../../testing/timeouts";

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
    const nothing = identityOfDrawn(plain).text;
    expect(identityOfDrawn(flat).text).toBe(nothing);
    expect(identityOfDrawn(chair).text).toBe(nothing);
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
      // (an atom the table does not name: the default, with no measured basis)
      ["CP(C)", 2],
      ["OB(O)", 2],
    ];
    for (const [first, k] of table) expect(kind(first), first).toBe(k);
  }, measured(3000));
});
