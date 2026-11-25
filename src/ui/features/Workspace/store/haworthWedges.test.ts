import { describe, expect, it } from "vitest";
import { createWorkspaceDocument } from "../document";
import { connectStoreToDocument, createEditorStore } from ".";
import { editorLayoutOptions, layoutAtomOf, layoutBond } from "../layoutOptions";
import { layoutByStructure, structureLayouts } from "../../../../lib/chem/layoutStructures";
import { DEFAULT_STYLE_CHOICE, styleOf } from "../../../../lib/chem/style";

function drawing() {
  const doc = createWorkspaceDocument();
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  return { doc, st: () => store.getState() };
}

describe("a Haworth ring put down on the page", () => {
  for (const [size, before] of [[6, 0], [5, 0], [6, 3], [5, 3]] as const) {
    it(`has its front bond bold and both side bonds wedges narrow at the back atom, wide at the front one - a ring of ${size}, put down beside ${before} other atoms`, () => {
      const { st } = drawing();
      // (other atoms on the page first, far off: the ring's atoms take other ids than the tool's own)
      for (let i = 0; i < before; i++) st().addAtom(40 + 3 * i, 40, "C");
      st().putHaworth({ x: 0, y: 0 });
      if (size === 5) st().putHaworth({ x: 0, y: 0 });
      const atoms = st().model.atoms.filter((a) => a.z != null);
      const ids = new Set(atoms.map((a) => a.id));
      const bonds = st().model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b));
      expect(atoms).toHaveLength(size);
      const z = new Map(atoms.map((a) => [a.id, a.z!]));
      // (the front edge: the two atoms nearest the viewer, the bond between them bold - Brecher 2006, ST-1.9)
      const front = [...atoms].sort((p, q) => q.z! - p.z!).slice(0, 2).map((a) => a.id);
      const bold = bonds.filter((b) => b.display === "bold");
      expect(bold).toHaveLength(1);
      expect([bold[0].a, bold[0].b].sort()).toEqual([...front].sort());
      const wedges = bonds.filter((b) => b.display === "wedge");
      expect(wedges).toHaveLength(2);
      for (const w of wedges) {
        const wide = front.includes(w.a) ? w.a : w.b;
        const narrow = wide === w.a ? w.b : w.a;
        // (each side bond runs from a front atom back; its narrow end is the atom behind)
        expect(front).toContain(wide);
        expect(front).not.toContain(narrow);
        expect(w.narrow).toBe(narrow);
        expect(z.get(w.narrow!)!).toBeLessThan(z.get(wide)!);
      }
      // (and drawn so, as the page lays its structures out one by one - beside other atoms too: each wedge's polygon twice as wide at its front
      //  atom as the line is at its back atom; zoom 20, as the page is at about 100 %)
      const all = st().model;
      const index = new Map(all.atoms.map((a, i) => [a.id, i]));
      const laid = layoutByStructure(
        all.atoms.map((a) => layoutAtomOf(a)),
        all.bonds.map((b) => layoutBond(b, index.get(b.a)!, index.get(b.b)!)),
        editorLayoutOptions(styleOf(DEFAULT_STYLE_CHOICE)),
        20,
        structureLayouts(),
        [],
      );
      for (const w of wedges) {
        const [back, front] = [atoms.find((a) => a.id === w.narrow)!, atoms.find((a) => a.id === (w.narrow === w.a ? w.b : w.a))!];
        const [dx, dy] = [front.x - back.x, front.y - back.y];
        const len = Math.hypot(dx, dy);
        const near = laid.polys
          .flatMap((p) => p.points)
          .map((p) => ({ t: ((p.x - back.x) * dx + (p.y - back.y) * dy) / len / len, d: Math.abs(((p.x - back.x) * dy - (p.y - back.y) * dx) / len) }))
          .filter((p) => p.t > -0.1 && p.t < 1.1 && p.d < 0.3);
        const halfAt = (end: number) => Math.max(...near.filter((p) => Math.abs(p.t - end) < 0.3).map((p) => p.d));
        expect(halfAt(1)).toBeGreaterThan(2 * halfAt(0));
      }
      // (nothing else in the ring has a look of its own)
      expect(bonds.filter((b) => b.display && b.display !== "bold" && b.display !== "wedge")).toHaveLength(0);
    });
  }
});
