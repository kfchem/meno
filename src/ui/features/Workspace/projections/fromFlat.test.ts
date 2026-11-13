import { describe, expect, it } from "vitest";
import { identityOfDrawn } from "../chem/identityOf";
import type { Model } from "../store/types";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { chairsIn } from "./chair";
import { CHAIR_CHANGED, chairFromFlat, NOT_DRAWN } from "./fromFlat";
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
  }, measured(1000));

  it("is not offered where the ring's centres have no configuration drawn, and says why; nor on a ring it does not draw", () => {
    expect(chairFromFlat(drawnFromSmiles("CC1CCCCC1O"), 2)).toEqual({ refused: NOT_DRAWN });
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

  it("puts, of a chair either way with as many groups axial, the group whose first atom ranks lowest equatorial - the same, however the drawing lies", () => {
    // (cis-1-ethyl-2-methylcyclohexane: one group axial in either chair)
    const flat = drawnFromSmiles("CC[C@@H]1CCCC[C@@H]1C");
    const axialGroup = (m: Model) => {
      const at = new Map(m.atoms.map((a) => [a.id, a]));
      const ring = new Set(chairsIn(m, new Set(m.atoms.map((a) => a.id)))[0]);
      const b = m.bonds.find((x) => ring.has(x.a) !== ring.has(x.b) && Math.abs(at.get(x.a)!.x - at.get(x.b)!.x) < 1e-6)!;
      return ring.has(b.a) ? b.b : b.a;
    };
    const seen = new Set([0, 1, 2, 3].map((k) => axialGroup(asChair(lying(flat, k), 3))));
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
});
