import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { drawingOf } from "../chem/drawing";
import { identityOfDrawn } from "../chem/identityOf";
import { drawnFromSmiles } from "../chem/testdata/identityCases";
import { template } from "./testdata/enumerationCases";
import type { Enumerated } from "./enumerate";
import { groupsReadAs, positionIds, positionMarks, positionsOf, readGroups, substituted } from "./substituents";
import type { WorkflowStep } from "../store/types";
import { kindInfo } from "./kinds";
import { shownOptions } from "../../../../lib/options";
import { runMenoDrawn } from "./meno";
import { recordHow, recordNumber } from "./entries";

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
const same = (m: Model, smiles: string) => identityOfDrawn(m).text === identityOfDrawn(drawnFromSmiles(smiles)).text;

// (p-xylene: atom 1 a methyl, 2 its ring carbon, 3 and 8 the CHs beside it - the same by symmetry)
const XYLENE = "Cc1ccc(C)cc1";

describe("a substituent swap's groups and positions, read", () => {
  it("one group to a line, read as an R group's options are, each said beside it", () => {
    expect(groupsReadAs("Me\notbs\n\nQqx").map((r) => [r.said, !!r.problem])).toEqual([
      ["CH3", false],
      [expect.stringMatching(/^OTBS · /), false],
      ["", false],
      ['"Qqx" is not an element, a group Meno knows, or a SMILES with a "*"', true],
    ]);
    expect(readGroups("Me\n\nCl").groups).toHaveLength(2);
    expect(readGroups("").problems).toEqual(["No groups yet: type one to a line"]);
  });

  it("positions are numbered by the template's own atom order, never the order they were chosen in, each named by its atom", () => {
    const { positions, problems } = positionsOf(drawnFromSmiles(XYLENE), positionIds("8 3"));
    expect(problems).toEqual([]);
    expect(positions.map((p) => p.name)).toEqual(["C3", "C8"]);
  });
});

describe("a substituent swap's known answers", () => {
  it("benzene, one CH chosen, with {Me, OMe}: two products in order, each saying where and what", () => {
    const r = ok(substituted(drawnFromSmiles("c1ccccc1"), [1], "Me\nOMe", "one"));
    expect(r.made.map((m) => [m.number, m.how, formula(m.drawn)])).toEqual([
      [1, "Position 1 (C1) = Me", "C7H8"],
      [2, "Position 1 (C1) = OMe", "C7H8O"],
    ]);
    expect(same(r.made[1].drawn, "COc1ccccc1")).toBe(true);
  });

  it("a methyl's carbon chosen: one of its hydrogens replaced - toluene with {Cl} is benzyl chloride", () => {
    const r = ok(substituted(drawnFromSmiles("Cc1ccccc1"), [1], "Cl", "one"));
    expect(r.made.map((m) => formula(m.drawn))).toEqual(["C7H7Cl"]);
    expect(same(r.made[0].drawn, "ClCc1ccccc1")).toBe(true);
  });

  it("one at a time, position outermost: p-xylene's two CHs beside a methyl with {Cl} - two combinations, the second the same as the first", () => {
    const r = ok(substituted(drawnFromSmiles(XYLENE), [3, 8], "Cl", "one"));
    expect(r.made.map((m) => [m.number, m.how])).toEqual([[1, "Position 1 (C3) = Cl"]]);
    expect(r.aside.map((m) => [m.number, m.how, m.why])).toEqual([[2, "Position 2 (C8) = Cl", "Same as 1"]]);
    expect(r.said[0]).toBe("1 made · 1 aside");
  });

  it("one at a time, each position's groups in their own order", () => {
    const r = ok(substituted(drawnFromSmiles("c1ccncc1"), [1, 3], "Me\nF", "one"));
    expect([...r.made, ...r.aside].sort((p, q) => p.number - q.number).map((m) => m.how)).toEqual([
      "Position 1 (C1) = Me",
      "Position 1 (C1) = F",
      "Position 2 (C3) = Me",
      "Position 2 (C3) = F",
    ]);
  });

  it("together, the first position outermost, H leaving a position as drawn: 2 positions × {H, Me} - four, the parent first, the third the same as the second", () => {
    const parent = drawnFromSmiles(XYLENE);
    const r = ok(substituted(parent, [3, 8], "H\nMe", "together"));
    expect(r.made.map((m) => [m.number, m.how, formula(m.drawn)])).toEqual([
      [1, "Position 1 (C3) = H, Position 2 (C8) = H", "C8H10"],
      [2, "Position 1 (C3) = H, Position 2 (C8) = Me", "C9H12"],
      [4, "Position 1 (C3) = Me, Position 2 (C8) = Me", "C10H14"],
    ]);
    expect(r.aside.map((m) => [m.number, m.why])).toEqual([[3, "Same as 2"]]);
    // (H at a position: nothing drawn there - the parent as it is drawn)
    expect(r.made[0].drawn.atoms).toHaveLength(parent.atoms.length);
  });

  it("a wedged centre's implicit H replaced: the group where the H was, the arrangement kept", () => {
    const r = ok(substituted(drawnFromSmiles("F[C@H](Cl)Br"), [2], "Me", "one"));
    expect(same(r.made[0].drawn, "F[C@](C)(Cl)Br")).toBe(true);
    expect(same(r.made[0].drawn, "F[C@@](C)(Cl)Br")).toBe(false);
  });

  it("a drawn H chosen: that H replaced in place, its bond and any wedge on it kept, its number its group's attach atom's", () => {
    const parent = drawnFromSmiles("F[C@]([H])(Cl)Br");
    const r = ok(substituted(parent, [3], "Me", "one"));
    const product = r.made[0].drawn;
    expect(same(product, "F[C@](C)(Cl)Br")).toBe(true);
    // (every bond of the template where it was, with its wedge)
    for (const b of parent.bonds) expect(product.bonds.find((x) => x.id === b.id)).toMatchObject({ a: b.a, b: b.b, ...(b.stereo ? { stereo: b.stereo } : {}) });
    expect(product.atoms.find((a) => a.id === 3)!.el).toBe("C");
  });

  it("keeps the template's atoms' numbers in every product: they come first, as drawn", () => {
    const parent = drawnFromSmiles("c1ccccc1");
    const r = ok(substituted(parent, [1, 4], "OMe", "together"));
    expect(r.made[0].drawn.atoms.slice(0, parent.atoms.length).map((a) => [a.id, a.el, a.x, a.y])).toEqual(parent.atoms.map((a) => [a.id, a.el, a.x, a.y]));
  });

  it("gives its sets the core every product shares: the template's atoms, each position by the atom its group is on", () => {
    const r = ok(substituted(drawnFromSmiles("F[C@]([H])(Cl)Br"), [3], "Me", "one"));
    // (the drawn H chosen is not core: its place is the group's)
    expect(r.core.atoms).toEqual([0, 1, 3, 4]);
    expect(r.core.attach).toEqual({ P1: [1] });
  });
});

describe("what stops a substituent swap before it runs, each said", () => {
  const benzene = () => drawnFromSmiles("c1ccccc1");

  it("no positions, and a position's atom gone from the drawing", () => {
    expect(problems(substituted(benzene(), [], "Me", "one"))).toEqual(["No positions chosen: choose atoms on the drawing"]);
    expect(problems(substituted(benzene(), [1, 99], "Me", "one"))).toEqual(["A position's atom is no longer in the drawing"]);
  });

  it("an atom with no hydrogen, and one whose hydrogens are all drawn", () => {
    expect(problems(substituted(drawnFromSmiles("CC(C)(C)C"), [2], "Me", "one"))).toEqual(["Position 1 (C2) has no hydrogen"]);
    expect(problems(substituted(drawnFromSmiles("C([H])([H])([H])F"), [1], "Me", "one"))).toEqual(["Position 1 (C1): its hydrogens are drawn - choose the H"]);
  });

  it("a drawn H that is not plain: a deuterium", () => {
    expect(problems(substituted(drawnFromSmiles("[2H]C"), [1], "Me", "one"))).toEqual(["Position 1 (H1) is not a plain hydrogen: only a plain H is replaced"]);
  });

  it("an atom inside a label, and a drawing with R groups", () => {
    const labelled = benzene();
    labelled.atoms[0] = { ...labelled.atoms[0], el: "Ph" };
    expect(problems(substituted(labelled, [1], "Me", "one"))).toEqual(["Position 1 (Ph1) is a label: expand Ph to choose in it"]);
    expect(problems(substituted(template("*c1ccccc1"), [3], "Me", "one"))).toEqual(["The drawing has R groups: enumerate them by R groups first"]);
  });

  it("a group that does not read, and H one position at a time", () => {
    expect(problems(substituted(benzene(), [1], "Qqx", "one"))).toEqual(['Group 1 ("Qqx"): "Qqx" is not an element, a group Meno knows, or a SMILES with a "*"']);
    expect(problems(substituted(benzene(), [1], "H\nMe", "one"))).toEqual(["H, one position at a time, only remakes the drawing: take it out, or combine the positions together"]);
  });

  it("more than 10,000 combinations, with the count", () => {
    expect(problems(substituted(benzene(), [1, 2, 3, 4, 5, 6], "Me\nEt\nF\nCl\nBr", "together"))).toEqual(["5 groups on 6 positions together make 15,625 combinations; Enumerate makes at most 10,000"]);
  });
});

describe("Enumerate's way: substituents", () => {
  it("shows only the way's own options: R groups its lists, substituents their positions, groups and how they combine", () => {
    const options = kindInfo("enumerate").options ?? [];
    expect(shownOptions(options, { way: "rgroups" }).map((o) => o.id)).toEqual(["way", "lists"]);
    expect(shownOptions(options, { way: "substituents" }).map((o) => o.id)).toEqual(["way", "positions", "groups", "combine"]);
  });

  it("is R groups unless the way is chosen, so a step saved before keeps what it did", () => {
    expect(kindInfo("enumerate").options!.find((o) => o.id === "way")!.default).toBe("rgroups");
    expect(kindInfo("enumerate").how!({ lists: "R1: Me\nCl" })).toBe("R1 · 2");
  });

  it("says on its card how many positions and groups, and how they combine", () => {
    const how = kindInfo("enumerate").how!;
    expect(how({ way: "substituents", positions: "3 8", groups: "Me\nCl\n", combine: "one" })).toBe("2 positions × 2 groups, one at a time");
    expect(how({ way: "substituents", positions: "", groups: "Me" })).toBe("No positions yet");
  });

  it("runs on the structure that comes in, each product with its number and how it was made", () => {
    const out = runMenoDrawn("enumerate", [{ place: 0, drawn: drawnFromSmiles(XYLENE) }], { way: "substituents", positions: "3 8", groups: "Cl", combine: "one" });
    if (!out.ok) throw new Error(out.said);
    expect(out.kept.map((e) => [recordNumber(e.record), recordHow(e.record)])).toEqual([[1, "Position 1 (C3) = Cl"]]);
    expect(out.aside).toHaveLength(1);
    expect(out.core?.attach).toEqual({ P1: [2], P2: [7] });
  });
});

describe("the positions chosen, marked on the drawing", () => {
  const drawn = drawnFromSmiles(XYLENE);
  const step = (id: number, options: WorkflowStep["options"]) => ({ id, kind: "enumerate", x: 0, y: 0, options }) as WorkflowStep;
  const steps = [step(1, { way: "substituents", positions: "8 3" }), step(2, { way: "rgroups", positions: "1" }), step(3, { way: "substituents", positions: "5 99" })];

  it("each numbered as the step numbers it, by the drawing's atom order, at its atom", () => {
    expect(positionMarks(drawn, steps, new Set([1])).map((m) => [m.n, m.x, m.y])).toEqual([
      [1, drawn.atoms[2].x, drawn.atoms[2].y],
      [2, drawn.atoms[7].x, drawn.atoms[7].y],
    ]);
  });

  it("only for a step by substituents that is shown - selected, open or chosen for - and only atoms still drawn", () => {
    expect(positionMarks(drawn, steps, new Set())).toEqual([]);
    expect(positionMarks(drawn, steps, new Set([2]))).toEqual([]);
    expect(positionMarks(drawn, steps, new Set([3])).map((m) => m.n)).toEqual([1]);
  });
});
