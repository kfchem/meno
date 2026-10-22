import { describe, expect, it } from "vitest";
import { layout2D, type Layout2D } from "./engine";
import { identityText } from "../chem/identity";
import { arranged, extentOf, gridOf, laidOnto, laidOutChecked } from "./many";
import { notAsGiven } from "./readBack";
import { coreMatches, ringScaffold } from "./scaffold";
import { analogues, CORES, CORE_SMILES } from "./testdata/analogues";
import facts from "./testdata/analogues.facts.json";
import { fromSmiles } from "./testdata/fromSmiles";

const laid = (smiles: string) => {
  const input = fromSmiles(smiles);
  return { input, out: layout2D(input) };
};
// (one with a centre shown by a wedge, one by an H drawn on a ring fusion, an E double bond, a charge)
const CENTRE = "C[C@H](N)C(=O)O";
const FUSION = "C1CC[C@H]2CCCC[C@H]2C1";
const ALKENE = "C/C=C/c1ccccc1";

describe("a drawing read back against the molecule given", () => {
  it("is the molecule given, as the engine draws it", () => {
    for (const s of [CENTRE, FUSION, ALKENE, "C[N+](C)(C)CC(=O)[O-]", "O=C1N(C)CC[C@@H]1c1ccccc1"]) {
      const { input, out } = laid(s);
      expect(notAsGiven(input, out), s).toEqual([]);
    }
  });

  it("says so where a wedge is turned to hashes", () => {
    const { input, out } = laid(CENTRE);
    expect(out.wedges.length).toBeGreaterThan(0);
    const turned: Layout2D = { ...out, wedges: out.wedges.map((w) => ({ ...w, stereo: w.stereo === "up" ? ("down" as const) : ("up" as const) })) };
    expect(notAsGiven(input, turned).join(" ")).toMatch(/other configuration/);
  });

  it("says so where the drawing is mirrored and its wedges left as they were", () => {
    const { input, out } = laid(FUSION);
    const mirrored: Layout2D = { ...out, x: out.x.map((x) => -x), hydrogens: out.hydrogens.map((h) => ({ ...h, at: { x: -h.at.x, y: h.at.y } })) };
    // (cis-decalin mirrored is the same molecule, but each of its two centres
    // now shows the other's configuration: atom by atom, which is how a
    // drawing's atoms keep what they are, not as given)
    expect(notAsGiven(input, mirrored).join(" ")).toMatch(/other configuration/);
    const amine = laid(CENTRE);
    const m2: Layout2D = { ...amine.out, x: amine.out.x.map((x) => -x), hydrogens: amine.out.hydrogens.map((h) => ({ ...h, at: { x: -h.at.x, y: h.at.y } })) };
    expect(notAsGiven(amine.input, m2).join(" ")).toMatch(/other configuration|not the structure given/);
  });

  it("says so where a double bond given trans is drawn cis", () => {
    const { input, out } = laid(ALKENE);
    // (the methyl, atom 0, put on the other side of the double bond 1=2)
    const [ax, ay, bx, by] = [out.x[1], out.y[1], out.x[2], out.y[2]];
    const [dx, dy] = [bx - ax, by - ay];
    const t = ((out.x[0] - ax) * dx + (out.y[0] - ay) * dy) / (dx * dx + dy * dy);
    const [fx, fy] = [ax + t * dx, ay + t * dy];
    const x = out.x.slice();
    const y = out.y.slice();
    [x[0], y[0]] = [2 * fx - out.x[0], 2 * fy - out.y[0]];
    expect(notAsGiven(input, { ...out, x, y }).join(" ")).toMatch(/drawn cis, given trans/);
  });

  it("says so where two atoms are on one place, and where one is not placed", () => {
    const { input, out } = laid(ALKENE);
    const x = out.x.slice();
    const y = out.y.slice();
    [x[5], y[5]] = [x[6], y[6]];
    expect(notAsGiven(input, { ...out, x, y }).join(" ")).toMatch(/one on the other/);
    x[3] = Number.NaN;
    expect(notAsGiven(input, { ...out, x, y }).join(" ")).toMatch(/not placed/);
  });

  it("says so where a configuration is shown that the molecule does not give", () => {
    const given = laid(CENTRE);
    const open = fromSmiles("CC(N)C(=O)O");
    expect(notAsGiven(open, given.out).join(" ")).toMatch(/a configuration shown where none is given/);
  });

  it("says so where the drawing shows another structure's stereo at a centre (the two configurations swapped between atoms)", () => {
    const { input, out } = laid("C[C@H](O)[C@@H](C)N");
    const swapped: Layout2D = { ...out, wedges: out.wedges.map((w) => ({ ...w, stereo: w.stereo === "up" ? ("down" as const) : ("up" as const) })).slice(0, 1).concat(out.wedges.slice(1)) };
    expect(notAsGiven(input, swapped).length).toBeGreaterThan(0);
  });
});

describe("many structures laid out at once", () => {
  it("lays out and reads back each, saying what is not as given rather than dropping it", () => {
    const r = laidOutChecked(fromSmiles(CENTRE));
    expect(r.layout).not.toBeNull();
    expect(r.notAsGiven).toEqual([]);
  });

  it("puts each in the middle of its own cell, the cells alike and none overlapping", () => {
    const outs = [CENTRE, FUSION, ALKENE, "CCCCCCCCCC"].map((s) => layout2D(fromSmiles(s)));
    const ext = outs.map(extentOf);
    const at = gridOf(ext, 1, 2);
    expect(at).toHaveLength(4);
    const w = Math.max(...ext.map((e) => e.maxX - e.minX)) + 1;
    const h = Math.max(...ext.map((e) => e.maxY - e.minY)) + 1;
    expect(at[1].x - at[0].x).toBeCloseTo(w, 9);
    expect(at[2].y - at[0].y).toBeCloseTo(h, 9);
    expect(at[3]).toEqual({ x: at[1].x, y: at[2].y });
  });

  it("lays a drawing onto points where it fits, turned or mirrored, every configuration as given and every bond as long", () => {
    for (const s of [CENTRE, FUSION, ALKENE, "C[C@H](O)[C@@H](C)N"]) {
      const { input, out } = laid(s);
      // (onto itself turned by 70 degrees and mirrored: it must go there, and still be the molecule given)
      const t = (70 * Math.PI) / 180;
      const pairs = out.x.map((x, i) => [i, { x: -(Math.cos(t) * x - Math.sin(t) * out.y[i]) + 5, y: Math.sin(t) * x + Math.cos(t) * out.y[i] - 3 }] as [number, { x: number; y: number }]);
      const on = laidOnto(out, pairs);
      pairs.forEach(([i, p]) => {
        expect(on.x[i]).toBeCloseTo(p.x, 6);
        expect(on.y[i]).toBeCloseTo(p.y, 6);
      });
      for (const b of input.bonds) expect(Math.hypot(on.x[b.a] - on.x[b.b], on.y[b.a] - on.y[b.b])).toBeCloseTo(Math.hypot(out.x[b.a] - out.x[b.b], out.y[b.a] - out.y[b.b]), 9);
      expect(notAsGiven(input, on), s).toEqual([]);
    }
  });
});

describe("analogues lined up on their core", () => {
  const sample = analogues().filter((_, i) => i % 20 === 0);
  const inputs = sample.map((a) => fromSmiles(a.smiles));
  const laidOut = inputs.map(laidOutChecked);

  it("are each the molecule given, laid out, lined up and set in the grid", () => {
    expect(new Set(inputs.map(identityText)).size).toBe(inputs.length);
    for (let c = 0; c < CORES.length; c++) {
      const idx = sample.flatMap((a, i) => (a.core === c ? [i] : []));
      const r = arranged(idx.map((i) => inputs[i]), idx.map((i) => laidOut[i]), { gap: 1.5, columns: 3, core: fromSmiles(CORE_SMILES[c]) });
      expect(r.series.map((s) => s.by), CORES[c]).toEqual(["core"]);
      expect(r.said).toEqual([]);
      r.notAsGiven.forEach((said, k) => expect(said, sample[idx[k]].smiles).toEqual([]));
      // (the first member's core where it is; each other's laid onto it)
      expect(r.off[0]).toBe(0);
      r.off.forEach((o) => expect(o).not.toBeNull());
    }
  });

  it("lies on the core as the first member draws it, where the core is a ring (the core's ring on the same place in every one)", () => {
    // (the benzene of 4-substituted benzamides: each member's ring atoms where the first's are)
    const idx = sample.flatMap((a, i) => (a.core === 0 ? [i] : []));
    const core = fromSmiles(CORE_SMILES[0]);
    const r = arranged(idx.map((i) => inputs[i]), idx.map((i) => laidOut[i]), { gap: 1.5, columns: 1, core });
    const rings = idx.map((i) => coreMatches(core, inputs[i])[0].slice(0, 6));
    const rel = (k: number) => rings[k].map((a) => ({ x: r.layouts[k]!.x[a] - r.at[k].x, y: r.layouts[k]!.y[a] - r.at[k].y }));
    const first = rel(0).map((p) => ({ x: p.x - rel(0)[0].x, y: p.y - rel(0)[0].y }));
    for (let k = 1; k < idx.length; k++) {
      const here = rel(k).map((p) => ({ x: p.x - rel(k)[0].x, y: p.y - rel(k)[0].y }));
      // (the ring the same shape and the same way round, within a twentieth of a bond)
      const off = Math.max(...here.map((p, j) => Math.hypot(p.x - first[j].x, p.y - first[j].y)));
      expect(off, sample[idx[k]].smiles).toBeLessThan(0.05 * 1.5);
    }
  });

  it("says, where no core is given, that it lined them up by ring scaffold - and keeps each series on rows of its own", () => {
    const r = arranged(inputs, laidOut, { gap: 1.5, columns: 4 });
    expect(r.said.join(" ")).toMatch(/ring scaffold/);
    expect(r.series.every((s) => s.by === "ring scaffold")).toBe(true);
    expect(r.series.reduce((n, s) => n + s.members.length, 0)).toBe(inputs.length);
    // (no two series share a row)
    const rows = r.series.map((s) => new Set(s.members.map((i) => Math.round(r.at[i].y / r.cell.h - 0.5))));
    for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) expect([...rows[a]].some((y) => rows[b].has(y))).toBe(false);
    r.notAsGiven.forEach((said) => expect(said).toEqual([]));
  });

  it("finds a core in each structure atom for atom, its bonds the same and no other between its atoms", () => {
    const core = fromSmiles("c1ccccc1C(=O)N");
    expect(coreMatches(core, fromSmiles("Cc1ccc(cc1)C(=O)NC")).length).toBeGreaterThan(0);
    // (an ester is not an amide; a ring closed across the core is not the core)
    expect(coreMatches(core, fromSmiles("Cc1ccc(cc1)C(=O)OC"))).toEqual([]);
    expect(coreMatches(fromSmiles("CCCC"), fromSmiles("C1CCC1"))).toEqual([]);
  });

  it("finds each structure's ring scaffold: its rings and the chains between them, no group off them", () => {
    const input = fromSmiles("CC(=O)Nc1ccc(OCc2ccncc2)cc1");
    const atoms = ringScaffold(input);
    expect(atoms.map((a) => input.atoms[a].el).sort().join("")).toBe("CCCCCCCCCCCCNO".split("").sort().join(""));
    expect(ringScaffold(fromSmiles("CCCCO"))).toEqual([]);
  });
});

describe("the known-answer analogues themselves", () => {
  const list = analogues();

  it("are each written as SMILES should be: one pair of brackets to a branch, none empty, every ring closed", () => {
    for (const { smiles } of list) {
      expect(smiles, smiles).not.toMatch(/\(\(|\(\)/);
      let depth = 0;
      for (const ch of smiles) {
        depth += ch === "(" ? 1 : ch === ")" ? -1 : 0;
        expect(depth, smiles).toBeGreaterThanOrEqual(0);
      }
      expect(depth, smiles).toBe(0);
      // (each ring-bond number opened and closed: an even count of each digit outside brackets)
      const digits = smiles.replace(/\[[^\]]*\]/g, "").replace(/[^0-9]/g, "");
      for (const d of new Set(digits)) expect(digits.split(d).length % 2, `${smiles}: ring ${d}`).toBe(1);
    }
  });

  it("are read by Meno as another reader reads them: each one's formula, charge, stereocentres and double bonds with a configuration (testdata/analogues.facts.json, RDKit's)", () => {
    expect(facts.analogues.map((f) => f.smiles)).toEqual(list.map((a) => a.smiles));
    for (const f of facts.analogues) {
      expect(f.read, f.smiles).toBe(true);
      const input = fromSmiles(f.smiles);
      const count = new Map<string, number>();
      for (const a of input.atoms) {
        count.set(a.el, (count.get(a.el) ?? 0) + 1);
        if (a.hs) count.set("H", (count.get("H") ?? 0) + a.hs);
      }
      // (Hill's order: C, then H, then the rest by symbol)
      const order = [...count.keys()].sort((p, q) => (p === "C" ? -1 : q === "C" ? 1 : p === "H" ? -1 : q === "H" ? 1 : p < q ? -1 : 1));
      const formula = order.map((el) => el + (count.get(el)! > 1 ? count.get(el) : "")).join("");
      expect(formula, f.smiles).toBe(f.formula);
      expect(input.atoms.reduce((s, a) => s + (a.charge ?? 0), 0), f.smiles).toBe(f.charge);
      expect(input.atoms.filter((a) => a.tetra).length, f.smiles).toBe(f.centres);
      expect(input.bonds.filter((b) => b.stereo).length, f.smiles).toBe(f.doubleBonds);
    }
  });
});
