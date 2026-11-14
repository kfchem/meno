import { describe, expect, it } from "vitest";
import { forgetLaidOut } from "../../../../lib/layout/engine";
import type { Model } from "../store/types";
import { readMarks } from "../utils/figures";
import { ARRANGEMENT_SAID } from "../utils/arrangement";
import { MENO } from "../../../../lib/chem/style";
import { laidOut } from "./cleanUp";
import { arrangementsMarked } from "./arrangementsMarked";
import { layoutJob, relayoutFrom } from "./engineLayout";
import type { Layout2D } from "../../../../lib/layout/engine";
import { drawingOf, metalsArrangedIn } from "./fromSmiles";
import { editorModelOf, processFileContent } from "../utils/io";

// A drawing nobody made - a plugin's of a typed SMILES or a step's structure - says nothing of which donors of a square-planar centre
// lie next to each other, wherever it puts them (docs/LAYOUT-2D.md, *A metal with four bonds*). Laid out, it is the engine's own;
// kept as it came, where it cannot be laid out, it is marked as a layout would mark it.

/** A square-planar centre of charge `charge` and four donors round it at `angles` (degrees), `els` in that order; other lines (MOL V2000) after. */
function molblock(metal: string, charge: number, els: string[], angles: number[], more: { atoms: string[]; bonds: string[] } = { atoms: [], bonds: [] }): string {
  const f = (v: number) => v.toFixed(4).padStart(10);
  const line = (x: number, y: number, el: string) => `${f(x)}${f(y)}${f(0)} ${el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`;
  const atoms = [line(0, 0, metal), ...els.map((el, k) => line(1.5 * Math.cos((angles[k] * Math.PI) / 180), 1.5 * Math.sin((angles[k] * Math.PI) / 180), el)), ...more.atoms];
  const bonds = [...els.map((_, k) => `  1${String(k + 2).padStart(3)}  1  0`), ...more.bonds];
  return ["", "  test", "", `${String(atoms.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`, ...atoms, ...bonds, ...(charge ? [`M  CHG  1   1${String(charge).padStart(4)}`] : []), "M  END", ""].join("\n");
}

/** The metal's donors round it, by element, read from the one the alphabet puts first: Br,Br,Cl,Cl is cis; Br,Cl,Br,Cl trans. */
function round(m: Model, metal: string): string {
  const c = m.atoms.find((a) => a.el === metal)!;
  const els = m.bonds
    .filter((b) => b.a === c.id || b.b === c.id)
    .map((b) => m.atoms.find((a) => a.id === (b.a === c.id ? b.b : b.a))!)
    .sort((p, q) => Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(q.y - c.y, q.x - c.x))
    .map((a) => a.el);
  const turns = els.map((_, k) => [...els.slice(k), ...els.slice(0, k)].join(","));
  return [...turns, ...turns.map((t) => t.split(",").reverse().join(","))].sort()[0];
}

const metalMarked = (m: Model, metal: string) => readMarks(m).atoms.get(m.atoms.find((a) => a.el === metal)!.id);

describe("a square-planar centre nobody gave the arrangement of", () => {
  it("is laid out the engine's own way, marked, whichever way the plugin drew its donors - cis or trans", { timeout: 120000 }, async () => {
    forgetLaidOut();
    const cis = await drawingOf(molblock("Pt", -2, ["Br", "Br", "Cl", "Cl"], [45, 135, 225, 315]));
    const trans = await drawingOf(molblock("Pt", -2, ["Br", "Cl", "Br", "Cl"], [45, 135, 225, 315]));
    expect([cis.asCame, trans.asCame]).toEqual([undefined, undefined]);
    expect(round(cis, "Pt")).toBe(round(trans, "Pt"));
    expect([metalMarked(cis, "Pt"), metalMarked(trans, "Pt")]).toEqual([ARRANGEMENT_SAID, ARRANGEMENT_SAID]);
  });

  it("where the chemist drew it, is laid out keeping their arrangement - cis and trans each its own", { timeout: 120000 }, async () => {
    forgetLaidOut();
    // (the same drawings, read as a file a chemist opens: their donors opposite each other kept)
    const read = async (els: string[]) => {
      return laidOut(editorModelOf((await processFileContent("drawn.mol", molblock("Pt", -2, els, [45, 135, 225, 315]))).model), MENO);
    };
    expect(round(await read(["Br", "Br", "Cl", "Cl"]), "Pt")).toBe("Br,Br,Cl,Cl");
    expect(round(await read(["Br", "Cl", "Br", "Cl"]), "Pt")).toBe("Br,Cl,Br,Cl");
  });

  it("is marked where the drawing is kept as it came - whatever kept it - as a layout would mark it", { timeout: 120000 }, async () => {
    forgetLaidOut();
    // ([PtCl2Br2]2-, and beside it an amine wedged at its N, whose wedge states nothing: the whole cannot be laid out)
    const amine = {
      atoms: [
        "    5.0000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0",
        "    5.0000    1.5000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
        "    6.2990   -0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
        "    3.7010   -0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
        "    2.4019    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
      ],
      bonds: ["  6  7  1  0", "  6  8  1  1", "  6  9  1  0", "  9 10  1  0"],
    };
    const kept = await drawingOf(molblock("Pt", -2, ["Br", "Br", "Cl", "Cl"], [30, 110, 200, 290], amine));
    expect(kept.asCame).toBeDefined();
    expect(metalMarked(kept, "Pt")).toBe(ARRANGEMENT_SAID);
    // (two donors next to each other swapped by the chemist - a Br and a Cl, cis made trans: the arrangement theirs, the mark gone)
    const pt = kept.atoms.find((a) => a.el === "Pt")!;
    const [, br, cl] = kept.bonds.filter((b) => b.a === pt.id || b.b === pt.id).map((b) => kept.atoms.find((a) => a.id === (b.a === pt.id ? b.b : b.a))!);
    const swapped: Model = { ...kept, atoms: kept.atoms.map((a) => (a.id === br.id ? { ...a, x: cl.x, y: cl.y } : a.id === cl.id ? { ...a, x: br.x, y: br.y } : a)) };
    expect(readMarks(swapped).atoms.has(pt.id)).toBe(false);
    // (the same, from a SMILES that gives its arrangement - its atoms in the block's order: kept as it came, and not marked)
    const block = molblock("Pt", -2, ["Br", "Br", "Cl", "Cl"], [30, 110, 200, 290], amine);
    const said = metalsArrangedIn("[Pt@SP1-2](Br)(Br)(Cl)Cl.N(C)(C)CC", block);
    expect(said).toEqual([0]);
    const keptGiven = await drawingOf(block, MENO, undefined, said);
    expect(keptGiven.asCame).toBeDefined();
    expect(metalMarked(keptGiven, "Pt")).toBeUndefined();
  });

  it("is marked only where surely square planar and its donors can lie more ways than one", () => {
    const at = (el: string, x: number, y: number, id: number, charge?: number) => ({ id, x, y, r: 0.9, el, ...(charge ? { charge } : {}) });
    const centre = (metal: string, els: string[], charge?: number): Model => ({
      atoms: [at(metal, 0, 0, 1, charge), ...els.map((el, k) => at(el, Math.cos(k + 0.3), Math.sin(k + 0.3), k + 2))],
      bonds: els.map((_, k) => ({ id: 10 + k, a: 1, b: k + 2, order: 1 as const })),
    });
    const marked = (m: Model) => readMarks(arrangementsMarked(m)).atoms.has(1);
    expect(marked(centre("Pt", ["Br", "Br", "Cl", "Cl"], -2))).toBe(true);
    expect(marked(centre("Pt", ["Cl", "Cl", "Cl", "Cl"], -2))).toBe(false);
    expect(marked(centre("Ni", ["Br", "Br", "Cl", "Cl"], -2))).toBe(false);
    const none = centre("Zn", ["Br", "Br", "Cl", "Cl"], -2);
    expect(arrangementsMarked(none)).toBe(none);
  });

  it("is drawn as the SMILES gives it where the SMILES marks it at the metal (@SP, @OH) - the plugin's places kept, no mark", { timeout: 120000 }, async () => {
    forgetLaidOut();
    // (trans-[PtCl2Br2]2- written Cl[Pt@SP1-2](Br)(Cl)Br: its block's atoms in the SMILES's order - Cl, Pt, Br, Cl, Br - the X
    // as the plugin draws it, Cl across Cl)
    const f = (v: number) => v.toFixed(4).padStart(10);
    const line = (deg: number | null, el: string) => (deg == null ? `${f(0)}${f(0)}${f(0)} ${el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0` : `${f(1.5 * Math.cos((deg * Math.PI) / 180))}${f(1.5 * Math.sin((deg * Math.PI) / 180))}${f(0)} ${el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
    const block = ["", "  test", "", "  5  4  0  0  0  0  0  0  0  0999 V2000", line(45, "Cl"), line(null, "Pt"), line(135, "Br"), line(225, "Cl"), line(315, "Br"), "  2  1  1  0", "  2  3  1  0", "  2  4  1  0", "  2  5  1  0", "M  CHG  1   2  -2", "M  END", ""].join("\n");
    expect(metalsArrangedIn("Cl[Pt@SP1-2](Br)(Cl)Br", block)).toEqual([1]);
    expect(metalsArrangedIn("Cl[Pt-2](Br)(Cl)Br", block)).toEqual([]);
    // (a block whose atoms are not the SMILES's, element by element: nothing taken as given)
    expect(metalsArrangedIn("Br[Pt@SP1-2](Cl)(Cl)Br", block)).toEqual([]);
    const given = await drawingOf(block, MENO, undefined, metalsArrangedIn("Cl[Pt@SP1-2](Br)(Cl)Br", block));
    expect(round(given, "Pt")).toBe("Br,Cl,Br,Cl");
    expect(metalMarked(given, "Pt")).toBeUndefined();
    // (the X it came as, kept: the bonds on the diagonals)
    const pt = given.atoms.find((a) => a.el === "Pt")!;
    for (const b of given.bonds) {
      const o = given.atoms.find((a) => a.id === (b.a === pt.id ? b.b : b.a))!;
      const t = (Math.atan2(o.y - pt.y, o.x - pt.x) * 180) / Math.PI;
      expect(Math.abs(((t % 90) + 90) % 90 - 45)).toBeLessThan(1);
    }
    // (the same block from a SMILES with no mark: the engine's own way, marked)
    const open = await drawingOf(block, MENO, undefined, metalsArrangedIn("Cl[Pt-2](Br)(Cl)Br", block));
    expect(metalMarked(open, "Pt")).toBe(ARRANGEMENT_SAID);
  });
});

describe("a metal of six donors nobody gave the arrangement of", () => {
  /** A metal and six donors on spokes 60 degrees apart, `els` in that order (each N its valence four: an amine, its pair lent); `chelates` joining two by two C's. */
  function six(els: string[], chelates: [number, number][] = [], metal = "Co"): Model {
    const atoms: Model["atoms"] = [{ id: 1, x: 0, y: 0, r: 0.9, el: metal }];
    const bonds: Model["bonds"] = [];
    els.forEach((el, k) => {
      atoms.push({ id: k + 2, x: 1.5 * Math.cos((k * Math.PI) / 3), y: 1.5 * Math.sin((k * Math.PI) / 3), r: 0.9, el, ...(el === "N" ? { valence: 4 } : {}) });
      bonds.push({ id: 100 + k, a: 1, b: k + 2, order: 1 });
    });
    for (const [p, q] of chelates) {
      const [a, b] = [atoms[1 + p], atoms[1 + q]];
      const c1 = atoms.length + 1;
      atoms.push({ id: c1, x: a.x * 1.8, y: a.y * 1.8, r: 0.9, el: "C" }, { id: c1 + 1, x: b.x * 1.8, y: b.y * 1.8, r: 0.9, el: "C" });
      bonds.push({ id: 200 + c1, a: a.id, b: c1, order: 1 }, { id: 201 + c1, a: c1, b: c1 + 1, order: 1 }, { id: 202 + c1, a: c1 + 1, b: b.id, order: 1 });
    }
    return { atoms, bonds } as Model;
  }
  const open = (m: Model) => readMarks(arrangementsMarked(m)).atoms.has(1);

  it("is marked where its donors could be set round it with other pairs across: cis or trans, fac or mer, a chelate's", () => {
    // (CHEM's five)
    expect(open(six(["Cl", "Cl", "N", "N", "N", "N"]))).toBe(true);
    expect(open(six(["Cl", "Cl", "Cl", "N", "N", "N"]))).toBe(true);
    expect(open(six(["Cl", "Cl", "Br", "Br", "N", "N"]))).toBe(true);
    expect(open(six(["Cl", "Cl", "N", "N", "N", "N"], [[2, 3], [4, 5]]))).toBe(true);
    expect(open(six(["N", "O", "N", "O", "N", "O"], [[0, 1], [2, 3], [4, 5]]))).toBe(true);
  });

  it("tells its donors apart as ligands, not by the atom on the metal alone: [Co(NH2Me)4(NH2Et)2]3+ is MA4B2, marked", () => {
    const m = six(["N", "N", "N", "N", "N", "N"]);
    // (a methyl on each of the first four N, an ethyl on the last two)
    let id = 50;
    m.atoms.slice(1).forEach((n, k) => {
      const c = ++id;
      m.atoms.push({ id: c, x: n.x * 1.8, y: n.y * 1.8, r: 0.9, el: "C" });
      m.bonds.push({ id: 300 + c, a: n.id, b: c, order: 1 });
      if (k < 4) return;
      const c2 = ++id;
      m.atoms.push({ id: c2, x: n.x * 2.6, y: n.y * 2.6, r: 0.9, el: "C" });
      m.bonds.push({ id: 300 + c2, a: c, b: c2, order: 1 });
    });
    expect(open(m)).toBe(true);
  });

  it("is not marked where every way sets the same pairs across: six alike, five and one, three like chelates, a chelate and four alike", () => {
    expect(open(six(["N", "N", "N", "N", "N", "N"]))).toBe(false);
    expect(open(six(["Cl", "N", "N", "N", "N", "N"]))).toBe(false);
    expect(open(six(["N", "N", "N", "N", "N", "N"], [[0, 1], [2, 3], [4, 5]]))).toBe(false);
    expect(open(six(["N", "N", "Cl", "Cl", "Cl", "Cl"], [[0, 1]]))).toBe(false);
  });

  it("from a plugin's drawing, laid out, is marked; with its arrangement given, or drawn by the chemist, it is not", { timeout: 120000 }, async () => {
    forgetLaidOut();
    const m = six(["Cl", "Cl", "N", "N", "N", "N"]);
    const block = ["", "  test", "", `${String(m.atoms.length).padStart(3)}${String(m.bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`,
      ...m.atoms.map((a) => `${a.x.toFixed(4).padStart(10)}${a.y.toFixed(4).padStart(10)}${(0).toFixed(4).padStart(10)} ${a.el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`),
      ...m.bonds.map((b) => `${String(b.a).padStart(3)}${String(b.b).padStart(3)}  1  0`), "M  CHG  1   1   1", "M  END", ""].join("\n");
    expect(metalMarked(await drawingOf(block, MENO), "Co")).toBe(ARRANGEMENT_SAID);
    expect(metalMarked(await drawingOf(block, MENO, undefined, [0]), "Co")).toBeUndefined();
    const chemist = await laidOut(editorModelOf((await processFileContent("drawn.mol", block)).model), MENO);
    expect(metalMarked(chemist, "Co")).toBeUndefined();
  });
});

describe("a four-bond metal drawn as an X, its donors going on", () => {
  it("is cleaned up as the X, its pairs across kept - nickel with phosphines, cis or trans, turned or not; platinum", { timeout: 120000 }, async () => {
    for (const [metal, els, turn] of [["Ni", ["Cl", "P", "Cl", "P"], 0], ["Ni", ["Cl", "Cl", "P", "P"], 0], ["Ni", ["Br", "P", "Br", "P"], 10], ["Pt", ["Cl", "Cl", "P", "P"], 0]] as const) {
    forgetLaidOut();
    const atoms: Model["atoms"] = [{ id: 1, x: 0, y: 0, r: 0.9, el: metal }];
    const bonds: Model["bonds"] = [];
    els.forEach((el, k) => {
      const t = ((45 + 90 * k + turn) * Math.PI) / 180;
      const d = atoms.length + 1;
      atoms.push({ id: d, x: 1.5 * Math.cos(t), y: 1.5 * Math.sin(t), r: 0.9, el });
      bonds.push({ id: 100 + bonds.length, a: 1, b: d, order: 1 });
      if (el !== "P") return;
      for (const s of [-1, 0, 1]) {
        const u = t + (s * Math.PI) / 3;
        atoms.push({ id: atoms.length + 1, x: 1.5 * Math.cos(t) + 1.5 * Math.cos(u), y: 1.5 * Math.sin(t) + 1.5 * Math.sin(u), r: 0.9, el: "C" });
        bonds.push({ id: 100 + bonds.length, a: d, b: atoms.length, order: 1 });
      }
    });
    const drawnModel = { atoms, bonds } as Model;
    const after = await laidOut(drawnModel, MENO);
    const m = after.atoms.find((a) => a.id === 1)!;
    for (const b of after.bonds.filter((x) => x.a === 1 || x.b === 1)) {
      const o = after.atoms.find((a) => a.id === (b.a === 1 ? b.b : b.a))!;
      const t = (Math.atan2(o.y - m.y, o.x - m.x) * 180) / Math.PI;
      expect(Math.abs((((t % 90) + 90) % 90) - 45), `${metal} ${els.join(",")}`).toBeLessThan(1);
    }
    expect(round(after, metal), `${metal} ${els.join(",")}`).toBe(round(drawnModel, metal));
    }
  });
});

describe("a square-planar centre whose donors differ only further out", () => {
  it("is open: [Pt(NH2Me)2(NH2Et)2]2+ is two and two, marked, not four alike", () => {
    const atoms: Model["atoms"] = [{ id: 1, x: 0, y: 0, r: 0.9, el: "Pt", charge: 2 }];
    const bonds: Model["bonds"] = [];
    ["Me", "Me", "Et", "Et"].forEach((g, k) => {
      const t = (k * Math.PI) / 2 + 0.3;
      const n = k + 2;
      atoms.push({ id: n, x: 1.5 * Math.cos(t), y: 1.5 * Math.sin(t), r: 0.9, el: "N", valence: 4 });
      bonds.push({ id: 100 + k, a: 1, b: n, order: 1 });
      atoms.push({ id: 10 + k, x: 2.7 * Math.cos(t), y: 2.7 * Math.sin(t), r: 0.9, el: "C" });
      bonds.push({ id: 200 + k, a: n, b: 10 + k, order: 1 });
      if (g === "Et") {
        atoms.push({ id: 20 + k, x: 3.9 * Math.cos(t), y: 3.9 * Math.sin(t), r: 0.9, el: "C" });
        bonds.push({ id: 300 + k, a: 10 + k, b: 20 + k, order: 1 });
      }
    });
    expect(readMarks(arrangementsMarked({ atoms, bonds } as Model)).atoms.get(1)).toBe(ARRANGEMENT_SAID);
  });
});

describe("a four-bond metal drawn as an upright cross, where the layout would make it the X", () => {
  it("is refused, saying so: the form drawn is kept either way", () => {
    const at = (deg: number) => ({ x: 1.5 * Math.cos((deg * Math.PI) / 180), y: 1.5 * Math.sin((deg * Math.PI) / 180) });
    const pts = [{ x: 0, y: 0 }, at(0), at(90), at(180), at(270)];
    const m = { atoms: pts.map((p, i) => ({ id: i + 1, ...p, r: 0.9, el: i ? "Cl" : "Pt", ...(i ? {} : { charge: -2 }) })), bonds: [2, 3, 4, 5].map((b, k) => ({ id: 10 + k, a: 1, b, order: 1 })) } as Model;
    const job = layoutJob(m);
    const xs = [{ x: 0, y: 0 }, at(45), at(135), at(225), at(315)].map((p) => ({ x: p.x / 1.5, y: p.y / 1.5 }));
    const laid = { x: xs.map((p) => p.x), y: xs.map((p) => p.y), depth: xs.map(() => null), solid: xs.map(() => false), bold: [], toward: [], dashed: [], wedges: [], hydrogens: [] } as unknown as Layout2D;
    expect(() => relayoutFrom(m, m, job, laid)).toThrow(/Pt drawn as an upright cross could not be laid out as one/);
  });
});
