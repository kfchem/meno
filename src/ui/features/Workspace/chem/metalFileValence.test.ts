import { describe, expect, it } from "vitest";
import { createSVG } from "../../../../lib/chem/layout2d";
import { MENO } from "../../../../lib/chem/style";
import { drawingLayout } from "../fileActions";
import { drawingOf as readDrawing } from "./drawing";
import { drawingOf } from "./fromSmiles";

// A metal from a file that sets its valence (V3000 `VAL=`) beside its bonds - as a toolkit writes a carbonyl's metal, its CO bound by
// dative bonds (type 9) - has no H for that valence to fill: its dative bonds are counted, and Ni(CO)4 is Ni, not NiH4. Each C of a
// carbonyl, isocyanide or cyanide on a metal is written (docs/LAYOUT-2D.md, section 7). The blocks are written here by hand.

type A = { el: string; x: number; y: number; chg?: number; val?: number };
type B = { a: number; b: number; type: number };

/** A V3000 MOL block of `atoms` and `bonds` (1-based), its charges and set valences as given. */
function block(atoms: A[], bonds: B[]): string {
  const lines = ["", "  hand-written", "", "  0  0  0  0  0  0  0  0  0  0999 V3000", "M  V30 BEGIN CTAB", `M  V30 COUNTS ${atoms.length} ${bonds.length} 0 0 0`, "M  V30 BEGIN ATOM"];
  atoms.forEach((a, i) => lines.push(`M  V30 ${i + 1} ${a.el} ${a.x.toFixed(4)} ${a.y.toFixed(4)} 0 0${a.chg ? ` CHG=${a.chg}` : ""}${a.val != null ? ` VAL=${a.val}` : ""}`));
  lines.push("M  V30 END ATOM", "M  V30 BEGIN BOND");
  bonds.forEach((b, i) => lines.push(`M  V30 ${i + 1} ${b.type} ${b.a} ${b.b}`));
  lines.push("M  V30 END BOND", "M  V30 END CTAB", "M  END", "");
  return lines.join("\n");
}

/** A metal at the middle with `ligands` round it, `n` of them evenly: each a C bound by a dative bond, then its other end. */
function ring(metal: A, ligands: { far: string; farChg?: number; cChg?: number; on?: string }[], extra: { el: string; type: number }[] = []): string {
  const n = ligands.length + extra.length;
  const atoms: A[] = [metal];
  const bonds: B[] = [];
  ligands.forEach((l, k) => {
    const t = (2 * Math.PI * k) / n;
    atoms.push({ el: "C", x: Math.cos(t), y: Math.sin(t), ...(l.cChg ? { chg: l.cChg } : {}) });
    const c = atoms.length;
    bonds.push({ a: c, b: 1, type: 9 });
    atoms.push({ el: l.far, x: 2 * Math.cos(t), y: 2 * Math.sin(t), ...(l.farChg ? { chg: l.farChg } : {}) });
    bonds.push({ a: c, b: atoms.length, type: 3 });
    if (l.on) {
      atoms.push({ el: l.on, x: 3 * Math.cos(t), y: 3 * Math.sin(t) });
      bonds.push({ a: atoms.length - 1, b: atoms.length, type: 1 });
    }
  });
  extra.forEach((e, k) => {
    const t = (2 * Math.PI * (ligands.length + k)) / n;
    atoms.push({ el: e.el, x: Math.cos(t), y: Math.sin(t) });
    bonds.push(e.type === 9 ? { a: atoms.length, b: 1, type: 9 } : { a: 1, b: atoms.length, type: e.type });
  });
  return block(atoms, bonds);
}

const co = { far: "O", farChg: 1, cChg: -1 };
const cnMe = { far: "N", farChg: 1, cChg: -1, on: "C" };

/** The metal's own H, as Meno reads the file, and how many C the picture writes. */
async function read(text: string, metal: string) {
  const m = await drawingOf(text);
  const d = readDrawing(m);
  const { layout, opts } = drawingLayout({ ...m, arrows: [], pluses: [], captions: [] } as never, { aromaticEnabled: false, aromaticRings: {} }, MENO);
  const letters = [...createSVG(layout, opts).matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((t) => t[1]);
  return { hs: d.atoms.find((a) => a.el === metal)!.hs, written: letters.filter((t) => t === "C").length };
}

describe("a metal from a file that sets its valence, its ligands bound by dative bonds", () => {
  for (const [name, text, metal, carbons] of [
    ["Ni(CO)4", ring({ el: "Ni", x: 0, y: 0, val: 4 }, [co, co, co, co]), "Ni", 4],
    ["Fe(CO)5", ring({ el: "Fe", x: 0, y: 0, val: 5 }, [co, co, co, co, co]), "Fe", 5],
    ["Cr(CO)6", ring({ el: "Cr", x: 0, y: 0, val: 6 }, [co, co, co, co, co, co]), "Cr", 6],
    ["cis-PdCl2(CNMe)2", ring({ el: "Pd", x: 0, y: 0, val: 4 }, [cnMe, cnMe], [{ el: "Cl", type: 1 }, { el: "Cl", type: 1 }]), "Pd", 2],
    ["cisplatin, its NH3 by dative bonds", ring({ el: "Pt", x: 0, y: 0, val: 4 }, [], [{ el: "Cl", type: 1 }, { el: "Cl", type: 1 }, { el: "N", type: 9 }, { el: "N", type: 9 }]), "Pt", 0],
  ] as const) {
    it(`reads no H on the metal, and writes each carbonyl's or isocyanide's C: ${name}`, { timeout: 60000 }, async () => {
      const got = await read(text, metal);
      expect(got.hs, name).toBe(0);
      expect(got.written, name).toBe(carbons);
    });
  }

  it("reads a hydride's one H where the file draws it: HMn(CO)5", { timeout: 60000 }, async () => {
    const text = ring({ el: "Mn", x: 0, y: 0, val: 6 }, [co, co, co, co, co], [{ el: "H", type: 1 }]);
    const m = await drawingOf(text);
    const d = readDrawing(m);
    const mn = d.atoms.findIndex((a) => a.el === "Mn");
    const drawnH = d.bonds.filter((b) => (b.a === mn && d.atoms[b.b].el === "H") || (b.b === mn && d.atoms[b.a].el === "H")).length;
    expect(d.atoms[mn].hs + drawnH).toBe(1);
  });
});
