import { describe, expect, it } from "vitest";
import { drawingLayout } from "./fileActions";
import { drawnFromSmiles } from "./utils/smilesDrawn";
import { MENO } from "../../../lib/chem/style";

// Where a solid wedge's broad end meets a bond running straight on - efavirenz's C4 to its alkyne, a nitrile's C - the end is cut square
// across at the atom, and the bond's lines start there: the wedge never runs on into a triple bond, a spike between its outer lines
// (lib/chem/layout2d `baseCut`). Each case is efavirenz's skeleton with another group on C4.

/** How far, in bonds along it, the ink of the wedge on C4's bond to the group (atoms 11 and 12, as written) reaches: its solid's, or its hashes'. */
function reachOf(smiles: string) {
  const m = drawnFromSmiles(smiles);
  const { layout } = drawingLayout(m, { aromaticEnabled: false, aromaticRings: {} }, MENO);
  const at = new Map(m.atoms.map((a) => [a.id, a]));
  const bond = m.bonds.find((b) => (b.a === 11 && b.b === 12) || (b.a === 12 && b.b === 11))!;
  const c = at.get(11)!;
  const e = at.get(12)!;
  const len = Math.hypot(e.x - c.x, e.y - c.y);
  const u = { x: (e.x - c.x) / len, y: (e.y - c.y) / len };
  const along = (p: { x: number; y: number }) => ((p.x - c.x) * u.x + (p.y - c.y) * u.y) / len;
  const off = (p: { x: number; y: number }) => Math.abs(-(p.x - c.x) * u.y + (p.y - c.y) * u.x) / len;
  let solid = -Infinity;
  for (const poly of layout.polys) for (const p of poly.points) if (off(p) < 0.5 && along(p) > 0.3 && along(p) < 1.5) solid = Math.max(solid, along(p));
  let hashes = -Infinity;
  if (bond.stereo === "down") for (const l of layout.lines) for (const p of [{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }]) if (off(p) < 0.3 && along(p) > 0.5 && along(p) < 1.5) hashes = Math.max(hashes, along(p));
  return { stereo: bond.stereo, solid, hashes };
}

describe("a wedge's broad end where it meets a bond", () => {
  it("ends at the atom where a triple bond runs straight on from it: efavirenz's alkyne, a nitrile", { timeout: 60000 }, () => {
    for (const smiles of ["O=C1Nc2ccc(Cl)cc2[C@@](C#CC2CC2)(C(F)(F)F)O1", "O=C1Nc2ccc(Cl)cc2[C@](C#N)(C(F)(F)F)O1"]) {
      const r = reachOf(smiles);
      expect(r.stereo, smiles).toBe("up");
      // (at the atom, past it by no more than a line's half width: the cut under the bond's own line's butt end)
      expect(r.solid, smiles).toBeGreaterThan(0.99);
      expect(r.solid, smiles).toBeLessThan(1.03);
    }
  });

  it("stops its hashes at the atom where a triple bond runs straight on, as before: efavirenz's mirror image, a nitrile", { timeout: 60000 }, () => {
    for (const smiles of ["O=C1Nc2ccc(Cl)cc2[C@](C#CC2CC2)(C(F)(F)F)O1", "O=C1Nc2ccc(Cl)cc2[C@@](C#N)(C(F)(F)F)O1"]) {
      const r = reachOf(smiles);
      expect(r.stereo, smiles).toBe("down");
      expect(r.hashes, smiles).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("is cut along the next bond as before where that bond turns off: a trans alkene, an ethyl", { timeout: 60000 }, () => {
    // (the cut follows the bond that carries on: a little past the atom, by where its edge crosses the wedge's)
    expect(reachOf("O=C1Nc2ccc(Cl)cc2[C@](/C=C/C2CC2)(C(F)(F)F)O1").solid).toBeCloseTo(1.197, 2);
    expect(reachOf("O=C1Nc2ccc(Cl)cc2[C@](CC)(C(F)(F)F)O1").solid).toBeCloseTo(1.088, 2);
  });
});

/**
 * For each wedge whose wide end's atom carries a double or triple bond: how far that bond's lines reach back past the atom, toward the
 * wedge, in bonds - the most of any - and how many such wedges there are.
 */
function linesBack(smiles: string) {
  const m = drawnFromSmiles(smiles);
  const { layout } = drawingLayout(m, { aromaticEnabled: false, aromaticRings: {} }, MENO);
  const at = new Map(m.atoms.map((a) => [a.id, a]));
  let worst = -Infinity;
  let wedges = 0;
  for (const w of m.bonds) {
    if (w.stereo !== "up" && w.stereo !== "down") continue;
    const narrow = w.narrow ?? w.a;
    const wide = narrow === w.a ? w.b : w.a;
    for (const next of m.bonds.filter((b) => b !== w && b.order >= 2 && (b.a === wide || b.b === wide))) {
      wedges++;
      const p = at.get(wide)!;
      const q = at.get(next.a === wide ? next.b : next.a)!;
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      const u = { x: (q.x - p.x) / len, y: (q.y - p.y) / len };
      // (the lines drawn along that bond: parallel to it, within half a bond of its own line, overlapping its length)
      for (const l of layout.lines) {
        const d = { x: l.x2 - l.x1, y: l.y2 - l.y1 };
        const dl = Math.hypot(d.x, d.y);
        if (dl < 1e-9 || Math.abs((d.x * u.y - d.y * u.x) / dl) > 0.05) continue;
        const along = (x: number, y: number) => ((x - p.x) * u.x + (y - p.y) * u.y) / len;
        const off = Math.abs(-(l.x1 - p.x) * u.y + (l.y1 - p.y) * u.x) / len;
        const [s0, s1] = [along(l.x1, l.y1), along(l.x2, l.y2)].sort((a, b) => a - b);
        if (off > 0.5 || s1 < 0.2 || s0 > 0.8) continue;
        worst = Math.max(worst, -s0);
      }
    }
  }
  return { worst, wedges };
}

describe("a multiple bond at a wedge's wide end", () => {
  // (Brecher 2008, GR-1.6: a double or triple bond's lines are one bond, between its own two atoms - none runs back beside the wedge)
  it("has every one of its lines between its own two atoms: efavirenz both ways, a nitrile both ways, a cyanohydrin, a vinyl carbinol", { timeout: 120000 }, () => {
    for (const smiles of [
      "O=C1Nc2ccc(Cl)cc2[C@@](C#CC2CC2)(C(F)(F)F)O1",
      "O=C1Nc2ccc(Cl)cc2[C@](C#CC2CC2)(C(F)(F)F)O1",
      "O=C1Nc2ccc(Cl)cc2[C@@](C#N)(C(F)(F)F)O1",
      "O=C1Nc2ccc(Cl)cc2[C@](C#N)(C(F)(F)F)O1",
      "N#C[C@](C)(O)CC",
      "N#C[C@@](C)(O)CC",
      "C=C[C@@H](O)CC",
      "C=C[C@H](O)CC",
    ]) {
      const r = linesBack(smiles);
      // (back past the atom by no more than a line's round cap)
      if (r.wedges) expect(r.worst, smiles).toBeLessThan(0.03);
    }
    // (efavirenz's wedge is on the bond to its alkyne carbon, both ways: the cases are met)
    expect(linesBack("O=C1Nc2ccc(Cl)cc2[C@@](C#CC2CC2)(C(F)(F)F)O1").wedges).toBeGreaterThan(0);
    expect(linesBack("O=C1Nc2ccc(Cl)cc2[C@](C#CC2CC2)(C(F)(F)F)O1").wedges).toBeGreaterThan(0);
  });
});
