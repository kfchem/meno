import { describe, expect, it } from "vitest";
import { drawnFromSmiles } from "../chem/testdata/identityCases";
import { emptyWorkspaceDocument, expandAbbreviation } from "../document";
import type { Model } from "../store/types";
import { alikePlain, changedAt, changesFrom, saidOf, unitName } from "./stereoKept";
import { enumerated } from "./enumerate";
import { template } from "./testdata/enumerationCases";

/** Every wedge turned: the mirror image's drawing. */
const mirror = (m: Model): Model => ({ ...m, bonds: m.bonds.map((b) => (b.stereo === "up" ? { ...b, stereo: "down" as const } : b.stereo === "down" ? { ...b, stereo: "up" as const } : b)) });

/** `m` with an H drawn as an atom on the centre `c`, beside its wedge, in the larger gap next to it: where a tetrahedron's H projects. */
function withH(m: Model, c: number, extra: Partial<Model["atoms"][number]> = {}): Model {
  const at = new Map(m.atoms.map((a) => [a.id, a]));
  const a = at.get(c)!;
  const out = m.bonds.filter((b) => b.a === c || b.b === c);
  const angle = (b: (typeof out)[number]) => {
    const o = at.get(b.a === c ? b.b : b.a)!;
    return Math.atan2(o.y - a.y, o.x - a.x);
  };
  const w = out.find((b) => (b.stereo === "up" || b.stereo === "down") && b.narrow === c)!;
  const turn = (x: number) => (((x - angle(w)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const rel = out.filter((b) => b !== w).map((b) => turn(angle(b)));
  const ccw = Math.min(...rel);
  const cw = 2 * Math.PI - Math.max(...rel);
  const dir = ccw >= cw ? angle(w) + ccw / 2 : angle(w) - cw / 2;
  const id = Math.max(...m.atoms.map((x) => x.id), ...m.bonds.map((b) => b.id)) + 1;
  return {
    atoms: [...m.atoms, { id, el: "H", x: a.x + Math.cos(dir) * 0.8, y: a.y + Math.sin(dir) * 0.8, r: 0.9, ...extra } as Model["atoms"][number]],
    bonds: [...m.bonds, { id: id + 1, a: c, b: id, order: 1 }],
  };
}

describe("the one comparison of two drawings' configurations, unit by unit", () => {
  it("sees an axis: a biaryl's turned over, or lost, is named - where it passed in silence before", () => {
    const binap = expandAbbreviation({ ...emptyWorkspaceDocument(), model: { atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el: "(R)-BINAP" }], bonds: [] }, nextId: 100 }, 1).model;
    expect(saidOf(binap).axes.size).toBe(1);
    expect(changedAt(binap, binap, new Map())).toEqual([]);
    const [axis] = changedAt(binap, mirror(binap), new Map());
    expect(axis.kind).toBe("axis");
    expect(changesFrom(binap, mirror(binap), new Map())).toEqual([{ ...axis, how: "inverted" }]);
    expect(unitName(binap, axis)).toMatch(/^the axis C\d+-C\d+$/);
    const lost = { ...binap, bonds: binap.bonds.map(({ stereo: _s, narrow: _n, ...b }) => b) };
    expect(changesFrom(binap, lost, new Map())).toEqual([{ ...axis, how: "opened" }]);
  });

  it("sees an odd cumulene's cis or trans, and names a double bond by its two atoms", () => {
    const e = drawnFromSmiles("C/C=C=C=C/C");
    const z = drawnFromSmiles("C/C=C=C=C\\C");
    expect(changesFrom(e, e, new Map())).toEqual([]);
    const [run] = changesFrom(e, z, new Map());
    expect(run).toMatchObject({ kind: "double", how: "inverted" });
    expect(unitName(e, run)).toBe("C2=C5");
    expect(unitName(drawnFromSmiles("C/C=C/C"), { kind: "double", at: [2, 3] })).toBe("C2=C3");
  });

  it("takes a centre's H drawn as an atom and its H carried for the same neighbour, either way round", () => {
    for (const smiles of ["F[C@H](Cl)Br", "C[C@@H](O)CC", "O[C@H]1CC[C@@H](C)CC1"]) {
      const m = drawnFromSmiles(smiles);
      for (const c of saidOf(m).centres.keys()) {
        const h = withH(m, c);
        expect(changesFrom(m, h, new Map()), smiles).toEqual([]);
        expect(changesFrom(h, m, new Map()), smiles).toEqual([]);
        // (and the H drawn, its configuration turned: inverted, not "the same")
        expect(changesFrom(m, mirror(h), new Map()).map((d) => d.how), smiles).toContain("inverted");
      }
    }
  });

  it("takes an H with a mass number for a group of its own, never the centre's carried H", () => {
    const m = drawnFromSmiles("F[C@H](Cl)Br");
    const d = withH(m, 2, { isotope: 2 } as Partial<Model["atoms"][number]>);
    expect(changesFrom(m, d, new Map())).toEqual([{ kind: "centre", at: 2, how: "opened" }]);
  });

  it("takes a P-H whose H is carried, its wedge stating nothing, against the same P-H drawn: closed, or opened - never the same", () => {
    // (ethylmethylphenylphosphine's P, its methyl then made the H: carried, and drawn where the methyl was - the wedge on its ethyl)
    const tertiary = drawnFromSmiles("CCP(C)c1ccccc1");
    const p = tertiary.atoms.find((a) => a.el === "P")!.id;
    const methyl = tertiary.atoms.find((a) => a.el === "C" && tertiary.bonds.filter((b) => b.a === a.id || b.b === a.id).length === 1 && tertiary.bonds.some((b) => (b.a === a.id && b.b === p) || (b.b === a.id && b.a === p)))!;
    const ethyl = tertiary.bonds.find((b) => (b.a === p || b.b === p) && (b.a === 2 || b.b === 2))!;
    const wedged = (m: Model): Model => ({ ...m, bonds: m.bonds.map((b) => (b.id === ethyl.id ? { ...b, stereo: "up" as const, narrow: p } : b)) });
    const carried = wedged({ atoms: tertiary.atoms.filter((a) => a.id !== methyl.id), bonds: tertiary.bonds.filter((b) => b.a !== methyl.id && b.b !== methyl.id) });
    const drawn = wedged({ atoms: tertiary.atoms.map((a) => (a.id === methyl.id ? { ...a, el: "H" } : a)), bonds: tertiary.bonds });
    expect(saidOf(carried).centres.has(p)).toBe(false);
    expect(changesFrom(carried, drawn, new Map())).toEqual([{ kind: "centre", at: p, how: "closed" }]);
    expect(changesFrom(drawn, carried, new Map())).toEqual([{ kind: "centre", at: p, how: "opened" }]);
  });

  it("matches an H replaced in place by a group, its id kept: the arrangement kept, not lost", () => {
    const template = drawnFromSmiles("F[C@]([H])(Cl)Br");
    const product = { ...template, atoms: template.atoms.map((a) => (a.el === "H" ? { ...a, el: "C" } : a)) };
    expect(changesFrom(template, product, new Map())).toEqual([]);
  });

  it("says a centre that is no longer one - two H, or two groups now alike - is so, stops nothing for it, and draws it plain", () => {
    const t = template("F[C@H](*)Cl");
    const r = enumerated(t, "R1: H\nCl\nMe");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.made.map((m) => m.how)).toEqual(["R1 = H", "R1 = Cl", "R1 = Me"]);
    const wedges = (m: Model) => m.bonds.filter((b) => b.stereo === "up" || b.stereo === "down").length;
    // (CH2FCl and CHFCl2: no centre, no wedge; CHF(Me)Cl: its centre kept on its wedge)
    expect(r.made.map((m) => wedges(m.drawn))).toEqual([0, 0, 1]);
    const made = (k: number) => r.made[k].drawn;
    expect(changedAt(t, made(2), new Map())).toEqual([]);
    // (what the comparison says of the first two, for the change note: no longer a centre, its groups alike)
    for (const k of [0, 1]) expect(changesFrom(t, made(k), new Map())).toEqual([{ kind: "centre", at: 2, how: "alike" }]);
    expect(alikePlain(t, made(2), new Map())).toBe(made(2));
  });

  it("leaves a ring's centres alike in both drawings as they were: cis-1,4-dimethylcyclohexane's wedges are kept", () => {
    const m = drawnFromSmiles("C[C@H]1CC[C@@H](C)CC1");
    expect(changesFrom(m, m, new Map())).toEqual([]);
    expect(alikePlain(m, m, new Map())).toBe(m);
  });
});
