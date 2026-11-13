import { describe, expect, it } from "vitest";
import { forgetLaidOut, layout2D } from "../../../../lib/layout/engine";
import { emptyWorkspaceDocument, relayout } from "../document";
import type { Model } from "../store/types";
import { readMarks } from "../utils/figures";
import { ARRANGEMENT_SAID } from "../utils/arrangement";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { layoutJob, relayoutFrom } from "./engineLayout";

// A square-planar centre whose donors can lie round it more than one way, made from an input that gives none of them - cisplatin
// from a SMILES - is drawn as the upright cross and marked: which donors are next to each other is not given (docs/LAYOUT-2D.md).
// Drawing nobody's isomer would say cis or trans; the cross alone still reads as one to a chemist who knows Pt(II).

const metalOf = (m: Model) => m.atoms.find((a) => a.el === "Pt" || a.el === "Pd")!;
/** The directions of the metal's four bonds, in degrees from -180 up. */
function directions(m: Model): number[] {
  const c = metalOf(m);
  return m.bonds
    .filter((b) => b.a === c.id || b.b === c.id)
    .map((b) => m.atoms.find((a) => a.id === (b.a === c.id ? b.b : b.a))!)
    .map((o) => Math.round((Math.atan2(o.y - c.y, o.x - c.x) * 180) / Math.PI))
    .map((d) => (d === 180 ? -180 : d === 0 ? 0 : d))
    .sort((p, q) => p - q);
}

describe("a square-planar centre with no arrangement given", () => {
  it("is the upright cross, marked, from a SMILES: cisplatin, PdCl2(PPh3)2 - and the X, unmarked, where the donors lie one way only", { timeout: 120000 }, () => {
    forgetLaidOut();
    for (const smiles of ["[NH3][Pt](Cl)(Cl)[NH3]", "Cl[Pd](Cl)(P(c1ccccc1)(c1ccccc1)c1ccccc1)P(c1ccccc1)(c1ccccc1)c1ccccc1"]) {
      const m = drawnFromSmiles(smiles);
      expect(directions(m), smiles).toEqual([-180, -90, 0, 90]);
      expect(readMarks(m).atoms.get(metalOf(m).id), smiles).toBe(ARRANGEMENT_SAID);
    }
    const one = drawnFromSmiles("Cl[Pt-2](Cl)(Cl)Cl");
    expect(directions(one)).toEqual([-135, -45, 45, 135]);
    expect(readMarks(one).atoms.size).toBe(0);
  });

  it("loses its mark when the chemist sets the arrangement - two donors moved round - and keeps it through a Clean-up that keeps the cross", { timeout: 120000 }, () => {
    forgetLaidOut();
    const m = drawnFromSmiles("[NH3][Pt](Cl)(Cl)[NH3]");
    const pt = metalOf(m);
    // (Clean-up: the cross kept, the mark with it)
    const job = layoutJob(m);
    const cleaned = relayout({ ...emptyWorkspaceDocument(), model: m, nextId: 3000 }, relayoutFrom(m, m, job, layout2D(job.input))).model;
    expect(readMarks(cleaned).atoms.get(pt.id)).toBe(ARRANGEMENT_SAID);
    // (two donors that lay next to each other swapped with ones across: the arrangement is the chemist's now)
    const round = m.bonds.filter((b) => b.a === pt.id || b.b === pt.id).map((b) => (b.a === pt.id ? b.b : b.a));
    const at = (id: number) => m.atoms.find((a) => a.id === id)!;
    const [p, q] = [at(round[0]), at(round[1])];
    const across = round.map(at).find((o) => o.id !== p.id && Math.hypot(o.x - p.x, o.y - p.y) > Math.hypot(q.x - p.x, q.y - p.y) + 1e-6) ?? at(round[2]);
    const swapped: Model = { ...m, atoms: m.atoms.map((a) => (a.id === p.id ? { ...a, x: across.x, y: across.y } : a.id === across.id ? { ...a, x: p.x, y: p.y } : a)) };
    expect(readMarks(swapped).atoms.has(pt.id)).toBe(false);
  });

  it("is not marked where the chemist drew it - an X, cis - and cleaned up stays as drawn", { timeout: 120000 }, () => {
    forgetLaidOut();
    const s = 1.5 / Math.SQRT2;
    const drawn: Model = {
      atoms: [
        { id: 1, x: 0, y: 0, r: 0.9, el: "Pt" },
        { id: 2, x: s, y: s, r: 0.9, el: "N" },
        { id: 3, x: -s, y: s, r: 0.9, el: "N" },
        { id: 4, x: -s, y: -s, r: 0.9, el: "Cl" },
        { id: 5, x: s, y: -s, r: 0.9, el: "Cl" },
      ],
      bonds: [2, 3, 4, 5].map((b, k) => ({ id: 10 + k, a: 1, b, order: 1 as const, stereo: "none" as const })),
    } as Model;
    const job = layoutJob(drawn);
    const after = relayout({ ...emptyWorkspaceDocument(), model: drawn, nextId: 100 }, relayoutFrom(drawn, drawn, job, layout2D(job.input))).model;
    expect(readMarks(after).atoms.size).toBe(0);
    expect(directions(after)).toEqual([-135, -45, 45, 135]);
  });
});
