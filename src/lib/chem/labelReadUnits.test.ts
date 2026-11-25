// A label typed run together is drawn in the units Meno reads it in: PtBu3, read as tri-tert-butylphosphine, is P and tBu3 - turned
// round at a left end tBu3P, its P on the bond - never the Pt and Bu3 of a platinum group. Through the app's own label drawing.
import { describe, expect, it } from "vitest";
import { buildTextLabels, type Atom, type Bond } from "./layout2d";
import { acsWorldOptions } from "./acs";
import { ABBREVIATIONS, GROUPS, abbreviationOf, abbreviationStructure, labelUnits, readUnits, turnedLabel } from "./abbreviations";
import { LIGANDS } from "./ligands";

const L = 1.5;
/** A label on the end of a two-carbon chain, its bond at the label's right (a left end) or at its left: the text and the run on the atom. */
const drawn = (el: string, bondAtRight: boolean) => {
  const s = bondAtRight ? 1 : -1;
  const atoms: Atom[] = [
    { id: 1, x: 0, y: 0, el },
    { id: 2, x: s * L, y: 0, el: "C" },
    { id: 3, x: 2 * s * L, y: L / 2, el: "C" },
  ];
  const bonds: Bond[] = [{ a1: 0, a2: 1, order: 1 }, { a1: 1, a2: 2, order: 1 }];
  const t = buildTextLabels(atoms, acsWorldOptions([], [], { units: "world" }), bonds).find((l) => l.atom === 0)!;
  return { text: t.text, atom: t.runs?.[t.anchorRun ?? 0]?.text };
};

describe("a typed label is drawn in the units it is read in", () => {
  it("PtBu3: tBu3P at a left end, PtBu3 at a right end, P on the bond; the atoms read unchanged", () => {
    expect(drawn("PtBu3", true)).toEqual({ text: "tBu3P", atom: "P" });
    expect(drawn("PtBu3", false)).toEqual({ text: "PtBu3", atom: "P" });
    const s = abbreviationStructure("PtBu3")!;
    expect(s.atoms.filter((a) => a.el === "P")).toHaveLength(1);
    expect(s.atoms.filter((a) => a.el === "C")).toHaveLength(12);
    expect(readUnits("PtBu3")).toEqual(["P", "tBu3"]);
  });

  it("NiPr2: iPr2N; OsBu and Os-Bu: sBuO and s-BuO; NHtBu: tBuHN, as NHBoc is BocHN", () => {
    expect(drawn("NiPr2", true)).toEqual({ text: "iPr2N", atom: "N" });
    expect(drawn("NiPr2", false)).toEqual({ text: "NiPr2", atom: "N" });
    expect(drawn("OsBu", true)).toEqual({ text: "sBuO", atom: "O" });
    expect(drawn("Os-Bu", true)).toEqual({ text: "s-BuO", atom: "O" });
    expect(drawn("NHtBu", true)).toEqual({ text: "tBuHN", atom: "N" });
    expect(drawn("NHBoc", true)).toEqual({ text: "BocHN", atom: "N" });
  });

  // every atom and group that, run together, read as another element or group, as typed: the units at a left end are those read
  it.each([
    ["PtBu2", "tBu2P", "P"],
    ["Pt-Bu2", "t-Bu2P", "P"],
    ["NiPr2", "iPr2N", "N"],
    ["Os-Bu", "s-BuO", "O"],
    ["BiPr2", "iPr2B", "B"],
    ["BiBu2", "iBu2B", "B"],
    ["SiPr", "iPrS", "S"],
    ["NHs-Bu", "s-BuHN", "N"],
    ["NHSu", "SuHN", "N"],
    ["NMOM2", "MOM2N", "N"],
    ["Np-Ns2", "p-Ns2N", "N"],
  ])("%s is drawn %s at a left end, %s on the bond", (typed, left, atom) => {
    const units = readUnits(typed)!;
    expect(units[0]).toBe(atom);
    expect(units.join("")).toBe(typed);
    expect(readUnits(typed, true)!.join("")).toBe(left);
    expect(drawn(typed, true)).toEqual({ text: left, atom });
    expect(drawn(typed, false)).toEqual({ text: typed, atom });
  });

  it("labels read as before are drawn as before", () => {
    for (const [typed, left, atom] of [
      ["PPh3", "Ph3P", "P"],
      ["OTBS", "TBSO", "O"],
      ["NHBoc", "BocHN", "N"],
      ["CO2Me", "MeO2C", "C"],
      ["PdCl2", "Cl2Pd", "Pd"],
      ["P(t-Bu)3", "(t-Bu)3P", "P"],
      ["PiPr3", "iPr3P", "P"],
    ]) {
      expect(drawn(typed, true)).toEqual({ text: left, atom });
      expect(drawn(typed, false)).toEqual({ text: typed, atom });
    }
    // (a metal with its ligands, a formula, or nothing read: no units of the reader's)
    expect(readUnits("PdCl2")).toBeNull();
    expect(readUnits("CO2Me")).toBeNull();
    expect(readUnits("xyz")).toBeNull();
  });

  // A ligand typed with its atom last, as on a bond's left: drawn as typed there, turned round at a right end, the atom on the bond.
  it.each([
    ["Ph3P", "PPh3", "P"],
    ["tBu3P", "PtBu3", "P"],
    ["t-Bu3P", "Pt-Bu3", "P"],
    ["Cy3P", "PCy3", "P"],
    ["Me3P", "PMe3", "P"],
    ["Ph3As", "AsPh3", "As"],
    ["(MeO)3P", "P(OMe)3", "P"],
    ["(PhO)3P", "P(OPh)3", "P"],
  ])("%s, typed with its atom last, is drawn as typed at a left end and %s at a right end, %s on the bond", (typed, right, atom) => {
    expect(drawn(typed, true)).toEqual({ text: typed, atom });
    expect(drawn(typed, false)).toEqual({ text: right, atom });
  });

  it("typed with the atom first, as before: PPh3 is Ph3P at a left end, PtBu3 tBu3P", () => {
    expect(drawn("PPh3", true)).toEqual({ text: "Ph3P", atom: "P" });
    expect(drawn("PPh3", false)).toEqual({ text: "PPh3", atom: "P" });
    expect(drawn("PtBu3", true)).toEqual({ text: "tBu3P", atom: "P" });
    expect(drawn("PtBu3", false)).toEqual({ text: "PtBu3", atom: "P" });
  });

  it("what a label typed with its atom last is read as does not change: the same structure as typed atom first", () => {
    for (const [last, first] of [["Ph3P", "PPh3"], ["tBu3P", "PtBu3"], ["Cy3P", "PCy3"], ["Me3P", "PMe3"]]) {
      const a = abbreviationStructure(last)!;
      const b = abbreviationStructure(first)!;
      expect(a.atoms.map((x) => x.el).sort()).toEqual(b.atoms.map((x) => x.el).sort());
      expect(a.atoms[a.attach[0]].el).toBe("P");
      expect(abbreviationOf(last)?.name).toBe(abbreviationOf(first)?.name);
    }
  });

  it("words Meno does not read are drawn as before at both ends", () => {
    for (const [typed, leftAtom, rightAtom] of [
      ["Me2N", "N", "Me"],
      ["MeO", "O", "Me"],
      ["Ph2P", "P", "Ph"],
      ["BocHN", "N", "Boc"],
    ]) {
      expect(readUnits(typed)).toBeNull();
      expect(drawn(typed, true)).toEqual({ text: typed, atom: leftAtom });
      expect(drawn(typed, false)).toEqual({ text: typed, atom: rightAtom });
    }
  });

  // A nitrile written as a formula, attached by its last atom: as typed at a left end, turned unit by unit at a right end - an atom
  // with its H and count one unit, CH3 - never NCH3C.
  it("MeCN and CH3CN: as typed at a left end, NCMe and NCCH3 at a right end, N on the bond; read as before", () => {
    expect(drawn("MeCN", true)).toEqual({ text: "MeCN", atom: "N" });
    expect(drawn("MeCN", false)).toEqual({ text: "NCMe", atom: "N" });
    expect(drawn("CH3CN", true)).toEqual({ text: "CH3CN", atom: "N" });
    expect(drawn("CH3CN", false)).toEqual({ text: "NCCH3", atom: "N" });
    for (const t of ["MeCN", "CH3CN"]) {
      const s = abbreviationStructure(t)!;
      expect(s.atoms[s.attach[0]].el).toBe("N");
      expect(s.atoms.filter((x) => x.el !== "H")).toHaveLength(3);
    }
  });

  // A prefix belongs to its group, read alone or not: o-Tol is never turned to Tol-o.
  it("P(o-Tol)3 is (o-Tol)3P at a left end; (o-Tol)3P typed is P(o-Tol)3 at a right end; P on the bond", () => {
    expect(drawn("P(o-Tol)3", true)).toEqual({ text: "(o-Tol)3P", atom: "P" });
    expect(drawn("P(o-Tol)3", false)).toEqual({ text: "P(o-Tol)3", atom: "P" });
    expect(drawn("(o-Tol)3P", true)).toEqual({ text: "(o-Tol)3P", atom: "P" });
    expect(drawn("(o-Tol)3P", false)).toEqual({ text: "P(o-Tol)3", atom: "P" });
  });

  // Every label Meno knows - the groups', the contracted labels', the ligands', each with O, S, NH or N before a group, and each
  // turned round as on a bond's left - read as attached by one atom whose element is its first or its last unit: at a left end and at
  // a right end the run on the bond is that atom's.
  it("the whole table: a label attached by its first or its last atom has that atom on its bond at both ends", () => {
    const names = new Set<string>();
    const add = (n: string) => [n, turnedLabel(n)].forEach((x) => names.add(x));
    for (const a of [...ABBREVIATIONS, ...LIGANDS]) [a.label, ...(a.also ?? [])].forEach(add);
    for (const g of GROUPS) for (const p of ["O", "S", "NH", "N"]) add(p + g.label);
    const wrong: string[] = [];
    let looked = 0;
    for (const n of names) {
      const a = abbreviationOf(n);
      if (!a || (a.kind && a.kind !== "ligand")) continue;
      const s = abbreviationStructure(n);
      if (!s || s.attach.length !== 1 || s.haptic?.length) continue;
      const el = s.atoms[s.attach[0]].el;
      const u = labelUnits(n);
      // (its first unit, or the atom run into a prefixed group: PtBu3, NHs-Bu)
      const first = u[0] === el || (el.length === 1 && n.startsWith(el) && /^(?:H\d*)?(?:sec|tert|[nistomp])-?[A-Z]/.test(n.slice(1)));
      if (!first && u[u.length - 1] !== el) continue;
      looked++;
      if (drawn(n, true).atom !== el || drawn(n, false).atom !== el) wrong.push(n);
    }
    expect(looked).toBeGreaterThan(300);
    expect(wrong.sort()).toEqual([]);
    // (and no label drawn, at either end, holds a prefix after its name: never Tol-o)
    const turnedPrefix = [...names].filter((n) => [true, false].some((left) => /-(?:sec|tert|[nistomp])(?![a-z])/.test(drawn(n, left).text)));
    expect(turnedPrefix).toEqual([]);
  });
});

