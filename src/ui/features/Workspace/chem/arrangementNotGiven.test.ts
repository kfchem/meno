import { describe, expect, it } from "vitest";
import { forgetLaidOut } from "../../../../lib/layout/engine";
import type { Model } from "../store/types";
import { readMarks } from "../utils/figures";
import { ARRANGEMENT_SAID } from "../utils/arrangement";
import { MENO } from "../../../../lib/chem/style";
import { laidOut } from "./cleanUp";
import { arrangementsMarked } from "./engineLayout";
import { drawingOf } from "./fromSmiles";
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
});
