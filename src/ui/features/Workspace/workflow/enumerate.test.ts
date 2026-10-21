import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { drawingOf } from "../chem/drawing";
import { identityOfDrawn } from "../chem/identityOf";
import { drawnFromSmiles } from "../chem/testdata/identityCases";
import { enumerated, MOST_COMBINATIONS, readLists, readOption, templateRs, type Enumerated } from "./enumerate";
import { measured } from "../../../../testing/timeouts";
import { emptyWorkspaceDocument, type WorkspaceDocument } from "../document";
import { countOf, numberedOn } from "./entries";
import { canWire, resultOf } from "./flow";
import { addSet, addStep, connect } from "./model";
import { runStep, showRun, type RunWith } from "./run";
import { readWorkflow } from "./saved";

/** A template drawn by Meno's engine from a SMILES, each "*" an R atom, numbered in order - or as `numbers` gives them. */
function template(smiles: string, numbers?: number[][]): Model {
  const m = drawnFromSmiles(smiles);
  let k = 0;
  return { ...m, atoms: m.atoms.map((a) => (a.el === "*" ? { ...a, el: "R#", rgroups: numbers?.[k++] ?? [++k] } : a)) };
}

/** A structure's molecular formula, Hill order, its hydrogens drawn and not. */
function formula(m: Model): string {
  const count = new Map<string, number>();
  const add = (el: string, n: number) => n && count.set(el, (count.get(el) ?? 0) + n);
  drawingOf(m).atoms.forEach((a, i) => {
    add(m.atoms[i].el, 1);
    add("H", a.hs);
  });
  const rest = [...count.keys()].filter((e) => e !== "C" && e !== "H").sort();
  return ["C", "H", ...rest].filter((e) => count.has(e)).map((e) => `${e}${count.get(e)! > 1 ? count.get(e) : ""}`).join("");
}

const ok = (r: Enumerated) => {
  if (!r.ok) throw new Error(r.problems.join("; "));
  return r;
};
const problems = (r: Enumerated) => (r.ok ? [] : r.problems);

describe("a list's lines, read", () => {
  it("as a label is read on the canvas - its case by smart labels - an element as that atom, a SMILES only with a *", () => {
    expect(readOption("otbs")).toMatchObject({ as: "label", label: "OTBS" });
    expect(readOption("Me")).toMatchObject({ as: "label", label: "Me", formula: "CH3" });
    expect(readOption("Cl")).toMatchObject({ as: "element", el: "Cl", formula: "Cl" });
    expect(readOption("H")).toMatchObject({ as: "element", el: "H" });
    expect(readOption("*C(=O)N(C)C")).toMatchObject({ as: "smiles", formula: "C3H6NO" });
    // (no *: never a SMILES - CO is a label, carbonyl)
    expect(readOption("CO")).not.toMatchObject({ as: "smiles" });
  });

  it("as lists, by R number, one option to a line", () => {
    const { lists, problems } = readLists("R1:  Me\n     Cl\n\nR2:  OMe\n     *C(=O)N(C)C\n");
    expect(problems).toEqual([]);
    expect([...lists.keys()]).toEqual([1, 2]);
    expect(lists.get(1)!.map((o) => ("label" in o ? o.label : "el" in o ? o.el : null))).toEqual(["Me", "Cl"]);
    expect(lists.get(2)).toHaveLength(2);
  });
});

describe("Enumerate's known answers", () => {
  it("one R on benzene with {Me, Cl}: two products, C7H8 and C6H5Cl, in that order, numbered 1 and 2", () => {
    const r = ok(enumerated(template("*c1ccccc1"), "R1: Me\nCl"));
    expect(r.made.map((m) => [m.number, m.how, formula(m.drawn)])).toEqual([
      [1, "R1 = Me", "C7H8"],
      [2, "R1 = Cl", "C6H5Cl"],
    ]);
    expect(r.aside).toEqual([]);
    expect(r.said[0]).toBe("2 made");
    expect(r.said[1]).toBe("Duplicates judged by Meno's identity: constitution and configurations as drawn, aromatic rings as one form");
  });

  it("3 x 2 = 6, in the fixed order, R1 outermost", () => {
    const r = ok(enumerated(template("*c1ccc(O*)cc1"), "R1: Me\nEt\nCl\nR2: Me\nAc"));
    expect(r.made.map((m) => [m.number, m.how])).toEqual([
      [1, "R1 = Me, R2 = Me"],
      [2, "R1 = Me, R2 = Ac"],
      [3, "R1 = Et, R2 = Me"],
      [4, "R1 = Et, R2 = Ac"],
      [5, "R1 = Cl, R2 = Me"],
      [6, "R1 = Cl, R2 = Ac"],
    ]);
  });

  it("a symmetric template: four combinations, three made, the fourth by number aside as Same as 2", () => {
    const r = ok(enumerated(template("*c1ccc(*)cc1"), "R1: Me\nCl\nR2: Me\nCl"));
    expect(r.made.map((m) => m.number)).toEqual([1, 2, 4]);
    expect(r.aside.map((m) => [m.number, m.how, m.why])).toEqual([[3, "R1 = Cl, R2 = Me", "Same as 2"]]);
    expect(r.said[0]).toBe("3 made · 1 aside");
  });

  it("two options of one list that read as the same group: the later aside", () => {
    const r = ok(enumerated(template("*c1ccccc1"), "R1: Me\nCH3\n*C"));
    expect(r.made.map((m) => m.number)).toEqual([1]);
    expect(r.aside.map((m) => m.why)).toEqual(["Same as 1", "Same as 1"]);
  });

  it("a stereocentre drawn next to an R: the arrangement kept as drawn, each group in the R's place", () => {
    const r = ok(enumerated(template("F[C@H](*)Cl"), "R1: Me\nEt"));
    expect(identityOfDrawn(r.made[0].drawn).text).toBe(identityOfDrawn(drawnFromSmiles("F[C@H](C)Cl")).text);
    expect(identityOfDrawn(r.made[1].drawn).text).toBe(identityOfDrawn(drawnFromSmiles("F[C@H](CC)Cl")).text);
    expect(identityOfDrawn(r.made[0].drawn).text).not.toBe(identityOfDrawn(drawnFromSmiles("F[C@@H](C)Cl")).text);
  });

  it("R1 = H next to a wedge: the compound drawn without that H, its configuration carried to the atom it is on", () => {
    const r = ok(enumerated(template("F[C@](*)(Cl)Br"), "R1: H"));
    expect(identityOfDrawn(r.made[0].drawn).text).toBe(identityOfDrawn(drawnFromSmiles("F[C@H](Cl)Br")).text);
  });

  it("a deuterium is not a hydrogen: R1 = H and R1 = D (a SMILES, *[2H]) are two structures", () => {
    const r = ok(enumerated(template("C*"), "R1: H\n*[2H]"));
    expect(r.made.map((m) => m.how)).toEqual(["R1 = H", "R1 = *[2H]"]);
    expect(r.aside).toEqual([]);
    // (D typed as a label is no element, as on the canvas: said, not taken for deuterium)
    expect(readOption("D")).toHaveProperty("problem");
  });

  it("one R number on two atoms: both take the same group, their groups' atoms numbered in the order of the two R atoms", () => {
    const t = template("*c1ccc(*)cc1", [[1], [1]]);
    const r = ok(enumerated(t, "R1: Et"));
    expect(r.made).toHaveLength(1);
    const p = r.made[0].drawn;
    // (the template's atoms first, as they were - the R atoms now each its group's attach atom - then the groups' others)
    expect(p.atoms.slice(0, t.atoms.length).map((a) => a.id)).toEqual(t.atoms.map((a) => a.id));
    const [r1, r2] = t.atoms.filter((a) => a.el === "R#").map((a) => a.id);
    const added = p.atoms.slice(t.atoms.length);
    const bondedTo = (id: number) => p.bonds.find((b) => (b.a === id || b.b === id) && (b.a === r1 || b.b === r1 || b.a === r2 || b.b === r2));
    const first = bondedTo(added[0].id)!;
    expect(first.a === r1 || first.b === r1).toBe(true);
    expect(added.map((a) => a.el)).toEqual(["C", "C"]);
  });

  it(`makes ${MOST_COMBINATIONS} combinations, and stops before making any of ${MOST_COMBINATIONS + 1}`, () => {
    const lines = (n: number, el: string) => Array(n).fill(el).join("\n");
    const at = ok(enumerated(template("*C*"), `R1: ${lines(100, "F")}\nR2: ${lines(100, "Cl")}`));
    expect(at.made.length + at.aside.length).toBe(MOST_COMBINATIONS);
    expect(problems(enumerated(template("*C"), `R1: ${lines(MOST_COMBINATIONS + 1, "F")}`))).toEqual(["a list of 10001 make 10,001 combinations; Enumerate makes at most 10,000"]);
  }, measured(60_000));
});

describe("what stops Enumerate before it runs, each said", () => {
  const benzene = () => template("*c1ccccc1");
  it("a line that reads as nothing, named, with what was tried", () => {
    expect(problems(enumerated(benzene(), "R1: Me\nQqx"))).toEqual(['R1, option 2 ("Qqx"): "Qqx" is not an element, a group Meno knows, or a SMILES with a "*"']);
  });
  it("a group attached by more than one atom, or by none - a chelating ligand, a whole molecule", () => {
    expect(problems(enumerated(benzene(), "R1: THF"))[0]).toMatch(/^R1, option 1 \("THF"\): THF is a ligand, bound by a pair it lends|^R1, option 1 \("THF"\): THF is a whole molecule/);
    expect(problems(enumerated(benzene(), "R1: bipy"))[0]).toMatch(/attached by 2 atoms: an R group is attached by one/);
  });
  it("a SMILES with two *, or a * bonded by a double bond", () => {
    expect(problems(enumerated(benzene(), "R1: *CC*"))[0]).toMatch(/Mark where it is attached with one "\*"/);
    expect(problems(enumerated(benzene(), "R1: *=O"))[0]).toMatch(/bonded by one single bond/);
  });
  it("an R number in the drawing with no list, and a list for an R not in it", () => {
    expect(problems(enumerated(template("*c1ccc(*)cc1"), "R1: Me"))).toEqual(["R2 is in the drawing but has no list"]);
    expect(problems(enumerated(benzene(), "R1: Me\nR3: Cl"))).toEqual(["R3 has a list but is not in the drawing"]);
  });
  it("an R atom bonded by two bonds, or by a double bond", () => {
    expect(problems(enumerated(template("C*C"), "R1: Me"))).toEqual(["An R1 is bonded by 2 bonds: an R group is bonded by one single bond"]);
    expect(problems(enumerated(template("C=*"), "R1: Me"))).toEqual(["An R1 is bonded by a double bond: an R group is bonded by one single bond"]);
  });
  it("an R with more than one number, or with none", () => {
    expect(problems(enumerated(template("*c1ccccc1", [[1, 2]]), "R1: Me"))[0]).toBe("R1,2 has more than one number: draw one R for each");
    const bare = { ...benzene(), atoms: benzene().atoms.map((a) => (a.el === "R#" ? { ...a, el: "R", rgroups: undefined } : a)) };
    expect(problems(enumerated(bare, "R1: Me"))[0]).toBe("An R has no number: number each, as R1, R2");
  });
  it("a wedge whose narrow end is at an R atom", () => {
    const t = template("*C(F)(Cl)Br");
    const r = t.atoms.find((a) => a.el === "R#")!.id;
    const wedged = { ...t, bonds: t.bonds.map((b) => (b.a === r || b.b === r ? { ...b, a: r, b: b.a === r ? b.b : b.a, stereo: "up" as const, stereoOrient: "reverse" as const } : b)) };
    expect(problems(enumerated(wedged, "R1: Me"))).toContain("A wedge starts at an R1: it would say nothing of the group put there");
  });
  it("a drawing with no R, and lists that are not lists", () => {
    expect(problems(enumerated(drawnFromSmiles("c1ccccc1"), ""))).toEqual(["The drawing has no R group: draw R1, R2 where the groups go"]);
    expect(problems(enumerated(benzene(), "Me\nR1: Cl"))).toEqual(['"Me" comes before any R number: start each list with its number, as "R1:"']);
    expect(problems(enumerated(benzene(), "R1: Me\nR1: Cl"))).toEqual(["R1 is listed twice"]);
    expect(problems(enumerated(benzene(), "R1:"))).toEqual(["R1 has no options"]);
  });
  it("names the template's R atoms by number, in the template's order", () => {
    const t = template("*c1ccc(*)cc1", [[2], [1]]);
    expect([...templateRs(t).rs.keys()]).toEqual([2, 1]);
  });
});

describe("Enumerate as a step", () => {
  const W: RunWith = { extentOf: () => ({ x0: -1, x1: 1, y0: -1, y1: 1 }), byOf: () => "meno", now: 1000 };
  /** A para-disubstituted benzene drawn, R1 and R2, in a set; an Enumerate step wired from it, its lists `lists`. */
  function page(lists: string): { doc: WorkspaceDocument; step: number } {
    const t = template("*c1ccc(*)cc1");
    let doc: WorkspaceDocument = { ...emptyWorkspaceDocument(), model: t, nextId: 5000 };
    doc = addSet(doc, { x0: -10, y0: -10, x1: 10, y1: 10 });
    doc = addStep(doc, "enumerate", 20, 0, { lists });
    const step = doc.steps![0].id;
    return { doc: connect(doc, { set: 1 }, step), step };
  }
  const entries = (doc: WorkspaceDocument, step: number, exit: string) => (resultOf(doc, step, exit)!.members ?? []).map((m) => ("structure" in m ? m.entry : undefined));

  it("is wired from a set of structures drawn, and makes its products into its sets - each with its number and how it was made, those aside with why", () => {
    const { doc, step } = page("R1: Me\nCl\nR2: Me\nCl");
    expect(canWire(doc, { set: 1 }, step)).toBe(true);
    const ran = runStep(doc, step, W);
    expect(ran.steps![0].ran).toMatchObject({ ok: true, said: expect.stringMatching(/^3 made · 1 aside · Duplicates judged by Meno's identity/) });
    expect(entries(ran, step, "out")).toEqual([
      { number: 1, how: "R1 = Me, R2 = Me" },
      { number: 2, how: "R1 = Me, R2 = Cl" },
      { number: 4, how: "R1 = Cl, R2 = Cl" },
    ]);
    expect(entries(ran, step, "rest")).toEqual([{ number: 3, how: "R1 = Cl, R2 = Me", why: "Same as 2" }]);
    expect(countOf(ran, resultOf(ran, step, "out")!)).toMatchObject({ holds: "structures", entries: 3 });
    // (the template untouched, where it was)
    expect(ran.model.atoms.filter((a) => t0(doc).has(a.id)).map((a) => [a.id, a.el, a.x, a.y])).toEqual(doc.model.atoms.map((a) => [a.id, a.el, a.x, a.y]));
  });

  it("shows each product's number under it, each where its structure lies in its set", () => {
    const { doc, step } = page("R1: Me\nCl\nR2: Me\nCl");
    const ran = runStep(doc, step, W);
    const shown = numberedOn(ran, ran.sets!);
    expect(shown.map((n) => n.entry.number)).toEqual([1, 2, 4, 3]);
    const out = resultOf(ran, step, "out")!;
    for (const n of shown.slice(0, 3)) expect(n.x > out.x0 && n.x < out.x1 && n.y > out.y0 && n.y < out.y1).toBe(true);
  });

  it("says why it cannot run, before anything is made, on the card", () => {
    const { doc, step } = page("R1: Me");
    const ran = runStep(doc, step, W);
    expect(ran.steps![0].ran).toMatchObject({ ok: false, said: "R2 is in the drawing but has no list" });
    expect(ran.model.atoms).toHaveLength(doc.model.atoms.length);
  });

  it("run again, its products replaced; kept with the run that made them, and shown again with their numbers", () => {
    const { doc, step } = page("R1: Me\nCl\nR2: Me\nCl");
    const first = runStep(doc, step, W);
    const changed = { ...first, steps: first.steps!.map((s) => ({ ...s, options: { lists: "R1: F\nR2: F" } })) };
    const second = runStep(changed, step, W);
    expect(entries(second, step, "out")).toEqual([{ number: 1, how: "R1 = F, R2 = F" }]);
    expect(entries(second, step, "rest")).toEqual([]);
    expect(second.steps![0].runs![0].results!.drawn!.made.map((m) => m.entry?.number)).toEqual([1, 2, 4]);
    const shown = showRun(second, step, 0, W);
    expect(entries(shown, step, "out").map((e) => e?.number)).toEqual([1, 2, 4]);
    expect(entries(shown, step, "rest")).toEqual([{ number: 3, how: "R1 = Cl, R2 = Me", why: "Same as 2" }]);
  });

  it("keeps each product's number in the file, with the set's members", () => {
    const { doc, step } = page("R1: Me\nCl\nR2: Me\nCl");
    const ran = runStep(doc, step, W);
    const read = readWorkflow(JSON.parse(JSON.stringify({ sets: ran.sets, steps: ran.steps, wires: ran.wires })))!;
    const out = read.sets.find((b) => b.id === resultOf(ran, step, "out")!.id)!;
    expect(out.members!.map((m) => ("structure" in m ? m.entry?.number : null))).toEqual([1, 2, 4]);
  });
});

/** The template's atoms, by id. */
const t0 = (doc: WorkspaceDocument) => new Set(doc.model.atoms.map((a) => a.id));
