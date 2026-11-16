import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { arrangementsDrawn, identityInputOf, identityOfDrawn } from "./identityOf";
import { identity } from "../../../../lib/chem/identity";
import { drawingOf } from "./drawing";
import { drawnStereo } from "../workflow/structuresTable";
import { ARRANGEMENT_SAID, arrangementAs } from "../utils/arrangement";
import { laidOut } from "./cleanUp";
import { MENO } from "../../../../lib/chem/style";

// Which of a metal's donors a drawing has across from each other, as identity reads it (chem/identityOf `arrangementsDrawn`):
// a six-donor metal however drawn (ST-2.11), a four-donor one where the drawing states it square planar - the X, or ST-2.6's
// wedge form - and never from the upright cross, which states no geometry.

type Spoke = { el: string; at: number; wedge?: "up" | "down"; valence?: number };

/** A metal at the page's origin with a donor at each spoke's angle (degrees), its atoms written in `order`. */
function drawn(metal: string, spokes: readonly Spoke[], order = spokes.map((_, i) => i)): Model {
  const atoms = [{ id: 1, x: 0, y: 0, r: 0.9, el: metal }] as Model["atoms"];
  const bonds: Model["bonds"] = [];
  for (const k of order) {
    const s = spokes[k];
    const t = (s.at * Math.PI) / 180;
    const id = 2 + k;
    atoms.push({ id, x: 1.5 * Math.cos(t), y: 1.5 * Math.sin(t), r: 0.9, el: s.el, ...(s.valence ? { valence: s.valence } : {}) } as Model["atoms"][number]);
    bonds.push({ id: 100 + id, a: 1, b: id, order: 1, stereo: s.wedge ?? "none", ...(s.wedge ? { narrow: 1 } : {}) } as Model["bonds"][number]);
  }
  return { atoms, bonds } as Model;
}

// (six spokes round Co; a chelate's two ends joined by its own atoms, laid outward)
function sixWith(els: string[], chelates: [number, number, string[]][] = []): Model {
  const m = drawn("Co", els.map((el, k) => ({ el, at: 60 * k, ...(el === "N" ? { valence: chelates.some(([p, q]) => p === k || q === k) ? 3 : 4 } : {}) })));
  let id = 100;
  for (const [p, q, chain] of chelates) {
    const [a, b] = [m.atoms[1 + p], m.atoms[1 + q]];
    let last = a.id;
    chain.forEach((el, k) => {
      const t = (k + 1) / (chain.length + 1);
      const x = (a.x + (b.x - a.x) * t) * 1.8;
      const y = (a.y + (b.y - a.y) * t) * 1.8;
      const at = ++id;
      m.atoms.push({ id: at, x, y, r: 0.9, el } as Model["atoms"][number]);
      m.bonds.push({ id: 1000 + at, a: last, b: at, order: 1, stereo: "none" } as Model["bonds"][number]);
      last = at;
    });
    m.bonds.push({ id: 2000 + id, a: last, b: b.id, order: 1, stereo: "none" } as Model["bonds"][number]);
  }
  return m;
}

// (an N bonded to the metal drawn as an ammine: four bonds, three of them its H's - not an amido)
const square = (els: readonly string[], turn: number): Spoke[] => els.map((el, k) => ({ el, at: turn + 90 * k + 3, ...(el === "N" ? { valence: 4 } : {}) }));

describe("a metal's donors across, read from a drawing", () => {
  it("cisplatin and transplatin drawn as the X are two structures, each one whatever order its atoms were drawn in", () => {
    const cis = identityOfDrawn(drawn("Pt", square(["Cl", "Cl", "N", "N"], 45))).text;
    const trans = identityOfDrawn(drawn("Pt", square(["Cl", "N", "Cl", "N"], 45))).text;
    expect(cis).not.toBe(trans);
    expect(identityOfDrawn(drawn("Pt", square(["N", "N", "Cl", "Cl"], 45), [3, 1, 0, 2])).text).toBe(cis);
    expect(identityOfDrawn(drawn("Pt", square(["N", "Cl", "N", "Cl"], 45), [2, 0, 3, 1])).text).toBe(trans);
  });

  it("a hydrogen bond drawn to the metal is no donor: cisplatin drawn as the X with one is still cis, the identity of cisplatin and a water apart", () => {
    const cis = drawn("Pt", square(["Cl", "Cl", "N", "N"], 45));
    const water = (hBond: boolean): Model => ({
      atoms: [...cis.atoms, { id: 50, x: 0.4, y: -1.6, r: 0.9, el: "H" }, { id: 51, x: 0.9, y: -2.4, r: 0.9, el: "O" }] as Model["atoms"],
      bonds: [...cis.bonds, { id: 150, a: 50, b: 51, order: 1, stereo: "none" }, ...(hBond ? [{ id: 151, a: 1, b: 50, order: 1, stereo: "none", hydrogen: true }] : [])] as Model["bonds"],
    });
    expect(arrangementsDrawn(drawingOf(water(true)), water(true))).toEqual(arrangementsDrawn(drawingOf(cis), cis));
    expect(identityOfDrawn(water(true)).text).toBe(identityOfDrawn(water(false)).text);
  });

  it("a chemist's upright cross on a metal surely square planar states its pairs (ST-2.6's acceptable form); Meno's marked cross, none", () => {
    // (cisplatin: Pt(II), its two NH3 drawn as ammines)
    const cross = (els: string[]) => drawn("Pt", square(els, 0));
    const cis = identityOfDrawn(cross(["Cl", "Cl", "N", "N"])).text;
    const trans = identityOfDrawn(cross(["Cl", "N", "Cl", "N"])).text;
    expect(cis).not.toBe(trans);
    expect(cis).toBe(identityOfDrawn(drawn("Pt", square(["Cl", "Cl", "N", "N"], 45))).text);
    // (laid out by Meno with nothing given, and marked so: read as none - until a donor is moved round)
    const laid = cross(["Cl", "Cl", "N", "N"]);
    const metal = laid.atoms[0];
    const marked: Model = { ...laid, atoms: [{ ...metal, unsure: { said: [ARRANGEMENT_SAID], as: arrangementAs(metal, laid.atoms, laid.bonds) } }, ...laid.atoms.slice(1)] };
    expect(arrangementsDrawn(drawingOf(marked), marked)).toEqual([]);
    // (its second Cl and first N swapped round: Cl across Cl, the cross kept)
    const moved: Model = { ...marked, atoms: marked.atoms.map((a) => (a.id === 3 ? { ...a, x: -1.5, y: 0 } : a.id === 4 ? { ...a, x: 0, y: 1.5 } : a)) };
    expect(arrangementsDrawn(drawingOf(moved), moved)).toHaveLength(1);
  });

  it("no drawing falls between the X and the cross: turned 22 degrees it is the cross, 23 the X - cis either way", () => {
    const at = (turn: number) => identityOfDrawn(drawn("Pt", ["Cl", "Cl", "N", "N"].map((el, k) => ({ el, at: turn + 90 * k, ...(el === "N" ? { valence: 4 } : {}) })))).text;
    const cis = at(45);
    expect([at(22), at(23), at(-22)]).toEqual([cis, cis, cis]);
  });

  it("a six-donor metal Meno laid out with nothing given, still marked so, is read as none until a donor is moved round", () => {
    const six = drawn("Co", ["Cl", "Cl", "N", "N", "N", "N"].map((el, k) => ({ el, at: 60 * k })));
    const metal = six.atoms[0];
    const marked: Model = { ...six, atoms: [{ ...metal, unsure: { said: [ARRANGEMENT_SAID], as: arrangementAs(metal, six.atoms, six.bonds) } }, ...six.atoms.slice(1)] };
    expect(arrangementsDrawn(drawingOf(six), six)).toHaveLength(1);
    expect(arrangementsDrawn(drawingOf(marked), marked)).toEqual([]);
  });

  it("five complexes typed with no arrangement, laid out with like donors side by side and marked: each open, not the isomer of its lines", () => {
    const cases: [string, Model][] = [
      ["[CoCl2(NH3)4]+", sixWith(["Cl", "Cl", "N", "N", "N", "N"])],
      ["CoCl3(NH3)3", sixWith(["Cl", "Cl", "Cl", "N", "N", "N"])],
      ["[CoCl2Br2(NH3)2]-", sixWith(["Cl", "Cl", "Br", "Br", "N", "N"])],
      ["[Co(en)2Cl2]+", sixWith(["Cl", "Cl", "N", "N", "N", "N"], [[2, 3, ["C", "C"]], [4, 5, ["C", "C"]]])],
      ["Co(gly)3", sixWith(["N", "O", "N", "O", "N", "O"], [[0, 1, ["C", "C"]], [2, 3, ["C", "C"]], [4, 5, ["C", "C"]]])],
    ];
    for (const [name, laid] of cases) {
      const metal = laid.atoms[0];
      const marked: Model = { ...laid, atoms: [{ ...metal, unsure: { said: [ARRANGEMENT_SAID], as: arrangementAs(metal, laid.atoms, laid.bonds) } }, ...laid.atoms.slice(1)] };
      expect([name, arrangementsDrawn(drawingOf(marked), marked)]).toEqual([name, []]);
      const { arrangements: _read, ...none } = identityInputOf(laid).input;
      expect([name, identityOfDrawn(marked).text === identity(none).text, identityOfDrawn(marked).text === identityOfDrawn(laid).text]).toEqual([name, true, false]);
    }
  });

  it("marked chelate complexes drawn with the pairs their marks say: trans and cis [Co(en)2Cl2]+, fac and mer Co(gly)3 each two structures", () => {
    // (each chelate's two ends on spokes next to each other; the pairs across, by element, are those the SMILES marks @OH1 state)
    const byEl = (m: Model) => {
      const d = drawingOf(m);
      const read = arrangementsDrawn(d, m);
      expect(read).toHaveLength(1);
      return read[0].pairs.map(([p, q]) => [d.atoms[p].el, d.atoms[q].el].sort().join("-")).sort();
    };
    const en = (p: number, q: number): [number, number, string[]] => [p, q, ["C", "C"]];
    const transEn = sixWith(["Cl", "N", "N", "Cl", "N", "N"], [en(1, 2), en(4, 5)]);
    const cisEn = sixWith(["Cl", "Cl", "N", "N", "N", "N"], [en(2, 3), en(4, 5)]);
    const fac = sixWith(["N", "O", "N", "O", "N", "O"], [en(0, 1), en(2, 3), en(4, 5)]);
    const mer = sixWith(["N", "O", "O", "N", "O", "N"], [en(0, 1), en(2, 3), en(4, 5)]);
    expect(byEl(transEn)).toEqual(["Cl-Cl", "N-N", "N-N"]);
    expect(byEl(cisEn)).toEqual(["Cl-N", "Cl-N", "N-N"]);
    expect(byEl(fac)).toEqual(["N-O", "N-O", "N-O"]);
    expect(byEl(mer)).toEqual(["N-N", "N-O", "O-O"]);
    expect(identityOfDrawn(transEn).text).not.toBe(identityOfDrawn(cisEn).text);
    expect(identityOfDrawn(fac).text).not.toBe(identityOfDrawn(mer).text);
    // (the same drawings marked as not given - the input's pairs not shown - are one open structure each pair: no isomer read that was not written)
    const unsure = (m: Model): Model => {
      const metal = m.atoms[0];
      return { ...m, atoms: [{ ...metal, unsure: { said: [ARRANGEMENT_SAID], as: arrangementAs(metal, m.atoms, m.bonds) } }, ...m.atoms.slice(1)] };
    };
    expect(identityOfDrawn(unsure(transEn)).text).toBe(identityOfDrawn(unsure(cisEn)).text);
    expect(identityOfDrawn(unsure(fac)).text).toBe(identityOfDrawn(unsure(mer)).text);
  });

  it("the earlier picture - four donors an X, two side by side - read where every reading is one structure, and Clean-up keeps the isomer", { timeout: 120000 }, async () => {
    // (spokes at `at` degrees: the X at 45, 135, 225 and 315, the two side by side at 75 and 105; each chelate's ends joined by two C)
    const picture = (els: string[], at: number[], chelates: [number, number][]): Model => {
      const m = drawn("Co", els.map((el, k) => ({ el, at: at[k], ...(el === "N" ? { valence: 3 } : {}) })));
      let id = 200;
      for (const [p, q] of chelates) {
        const [a, b] = [m.atoms[1 + p], m.atoms[1 + q]];
        const c1 = ++id;
        const c2 = ++id;
        m.atoms.push({ id: c1, x: a.x * 1.8, y: a.y * 1.8, r: 0.9, el: "C" } as Model["atoms"][number], { id: c2, x: b.x * 1.8, y: b.y * 1.8, r: 0.9, el: "C" } as Model["atoms"][number]);
        m.bonds.push({ id: 3000 + c1, a: a.id, b: c1, order: 1, stereo: "none" } as Model["bonds"][number], { id: 3001 + c1, a: c1, b: c2, order: 1, stereo: "none" } as Model["bonds"][number], { id: 3002 + c1, a: c2, b: b.id, order: 1, stereo: "none" } as Model["bonds"][number]);
      }
      return m;
    };
    const byEl = (m: Model) => {
      const d = drawingOf(m);
      const read = identityInputOf(m).input.arrangements ?? [];
      return read.flatMap((x) => x.pairs.map(([p, q]) => [d.atoms[p].el, d.atoms[q].el].sort().join("-"))).sort();
    };
    const X = [45, 135, 225, 315, 75, 105];
    // ([Co(en)2Cl2]+ in it: each en across the X's corners next to each other - cis, as its maker meant)
    const enPicture = picture(["N", "N", "N", "N", "Cl", "Cl"], X, [[0, 1], [2, 3]]);
    expect(byEl(enPicture)).toEqual(["Cl-N", "Cl-N", "N-N"]);
    // (Co(gly)2Cl2-, its lines N-O and O-N: one answer; its lines N-N and O-O: two, so none)
    expect(byEl(picture(["N", "O", "O", "N", "Cl", "Cl"], X, [[0, 1], [2, 3]]))).toEqual(["Cl-N", "Cl-O", "N-O"]);
    expect(byEl(picture(["N", "O", "N", "O", "Cl", "Cl"], X, [[0, 1], [2, 3]]))).toEqual([]);
    // (two donors side by side are never a pair across: no reading of six spokes leaves them so)
    const cisSpokes = sixWith(["Cl", "Cl", "N", "N", "N", "N"], [[2, 3, ["C", "C"]], [4, 5, ["C", "C"]]]);
    expect(identityOfDrawn(enPicture).text).toBe(identityOfDrawn(cisSpokes).text);
    // (Clean-up of the cis drawn by hand: the same structure after, whatever picture it draws)
    const after = await laidOut(cisSpokes, MENO);
    expect(identityOfDrawn(after).text).toBe(identityOfDrawn(cisSpokes).text);
  });

  it("the upright cross on a metal not surely square planar states no geometry: cis and trans drawn so are one structure, matching neither X", () => {
    const cross = (els: string[]) => drawn("Ni", square(els, 0));
    expect(arrangementsDrawn(drawingOf(cross(["Cl", "Cl", "N", "N"])))).toEqual([]);
    const open = identityOfDrawn(cross(["Cl", "Cl", "N", "N"])).text;
    expect(identityOfDrawn(cross(["Cl", "N", "Cl", "N"])).text).toBe(open);
    expect(identityOfDrawn(drawn("Ni", square(["Cl", "Cl", "N", "N"], 45))).text).not.toBe(open);
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
      { el: "N", at: 340, wedge: "up", valence: 4 },
      { el: "Cl", at: 20, wedge: "down" },
      { el: "N", at: 160, wedge: "down", valence: 4 },
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
