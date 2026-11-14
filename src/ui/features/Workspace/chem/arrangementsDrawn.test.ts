import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { arrangementsDrawn, identityOfDrawn } from "./identityOf";
import { drawingOf } from "./drawing";
import { drawnStereo } from "../workflow/structuresTable";

// Which of a metal's donors a drawing has across from each other, as identity reads it (chem/identityOf `arrangementsDrawn`):
// a six-donor metal however drawn (ST-2.11), a four-donor one where the drawing states it square planar - the X, or ST-2.6's
// wedge form - and never from the upright cross, which states no geometry.

type Spoke = { el: string; at: number; wedge?: "up" | "down" };

/** A metal at the page's origin with a donor at each spoke's angle (degrees), its atoms written in `order`. */
function drawn(metal: string, spokes: readonly Spoke[], order = spokes.map((_, i) => i)): Model {
  const atoms = [{ id: 1, x: 0, y: 0, r: 0.9, el: metal }] as Model["atoms"];
  const bonds: Model["bonds"] = [];
  for (const k of order) {
    const s = spokes[k];
    const t = (s.at * Math.PI) / 180;
    const id = 2 + k;
    atoms.push({ id, x: 1.5 * Math.cos(t), y: 1.5 * Math.sin(t), r: 0.9, el: s.el } as Model["atoms"][number]);
    bonds.push({ id: 100 + id, a: 1, b: id, order: 1, stereo: s.wedge ?? "none", ...(s.wedge ? { narrow: 1 } : {}) } as Model["bonds"][number]);
  }
  return { atoms, bonds } as Model;
}

const square = (els: readonly string[], turn: number): Spoke[] => els.map((el, k) => ({ el, at: turn + 90 * k + 3 }));

describe("a metal's donors across, read from a drawing", () => {
  it("cisplatin and transplatin drawn as the X are two structures, each one whatever order its atoms were drawn in", () => {
    const cis = identityOfDrawn(drawn("Pt", square(["Cl", "Cl", "N", "N"], 45))).text;
    const trans = identityOfDrawn(drawn("Pt", square(["Cl", "N", "Cl", "N"], 45))).text;
    expect(cis).not.toBe(trans);
    expect(identityOfDrawn(drawn("Pt", square(["N", "N", "Cl", "Cl"], 45), [3, 1, 0, 2])).text).toBe(cis);
    expect(identityOfDrawn(drawn("Pt", square(["N", "Cl", "N", "Cl"], 45), [2, 0, 3, 1])).text).toBe(trans);
  });

  it("the upright cross states no geometry: cis and trans drawn so are one structure, matching neither X", () => {
    const cross = (els: string[]) => drawn("Pt", square(els, 0));
    expect(arrangementsDrawn(drawingOf(cross(["Cl", "Cl", "N", "N"])))).toEqual([]);
    const open = identityOfDrawn(cross(["Cl", "Cl", "N", "N"])).text;
    expect(identityOfDrawn(cross(["Cl", "N", "Cl", "N"])).text).toBe(open);
    expect(identityOfDrawn(drawn("Pt", square(["Cl", "Cl", "N", "N"], 45))).text).not.toBe(open);
  });

  it("a structure kept as the plugin laid it out - PdCl2(PPh3)2's bonds at 177, 120, 271 and 40 degrees - is neither the X nor the wedge form: open", () => {
    const kept = drawn("Pd", [
      { el: "Cl", at: 177 },
      { el: "P", at: 120 },
      { el: "Cl", at: 271 },
      { el: "P", at: 40 },
    ]);
    expect(arrangementsDrawn(drawingOf(kept))).toEqual([]);
  });

  it("ST-2.6's wedge form states square planar: two wedges and two hashes, narrow at the metal", () => {
    // (two solid wedges below, two hashed above; each drawn diagonal across: Cl across Cl - trans)
    const spokes: Spoke[] = [
      { el: "Cl", at: 200, wedge: "up" },
      { el: "N", at: 340, wedge: "up" },
      { el: "Cl", at: 20, wedge: "down" },
      { el: "N", at: 160, wedge: "down" },
    ];
    const read = arrangementsDrawn(drawingOf(drawn("Pt", spokes)));
    expect(read).toHaveLength(1);
    expect(identityOfDrawn(drawn("Pt", spokes)).text).toBe(identityOfDrawn(drawn("Pt", square(["Cl", "N", "Cl", "N"], 45))).text);
  });

  it("six donors as six spokes: fac and mer two structures", () => {
    const six = (els: string[]) => drawn("Co", els.map((el, k) => ({ el, at: 60 * k })));
    // (mer: the Cl in a line and one more; fac: no two Cl across)
    const mer = identityOfDrawn(six(["Cl", "Cl", "N", "Cl", "N", "N"])).text;
    const fac = identityOfDrawn(six(["Cl", "Cl", "Cl", "N", "N", "N"])).text;
    expect(mer).not.toBe(fac);
    expect(identityOfDrawn(six(["N", "N", "Cl", "N", "Cl", "Cl"])).text).toBe(mer);
  });

  it("a table's SMILES says it leaves the drawing's stereo out for cisplatin drawn as the X, not for PtCl4 2-", () => {
    expect(drawnStereo(drawn("Pt", square(["Cl", "Cl", "N", "N"], 45)))).toBe(true);
    expect(drawnStereo(drawn("Pt", square(["Cl", "Cl", "Cl", "Cl"], 45)))).toBe(false);
  });
});
