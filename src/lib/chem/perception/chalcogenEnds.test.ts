/**
 * The end chalcogens on P, As, Sb, S, Se and Te as identity compares them (./chalcogenEnds), asked directly: what the uncharged
 * form leaves as drawn, and how the lone-pair rule reads a centre whose ends share their bonds. Identity's known answers are in
 * ./stereo/units.test.ts.
 */
import { describe, expect, it } from "vitest";
import { smilesInput } from "../../layout/smilesInput";
import { identity, identityText } from "../identity";
import { chalcogenEnds, elementOf, endsShared, SHARED_END, unchargedEnds } from "./chalcogenEnds";
import { blanksOf } from "./stereo/units";
import type { SymmetryInput } from "./symmetry";

const graph = (smiles: string) => smilesInput(smiles) as unknown as SymmetryInput;
/** The atoms `blanksOf` asks as centres, once the ends are written as identity writes them. */
const centres = (smiles: string) => blanksOf(chalcogenEnds(graph(smiles))).flatMap((b) => (b.kind === "centre" ? [b.at] : []));

describe("the uncharged form", () => {
  it("leaves a structure as drawn - the same object - where no X+ has an end to take: a neutral S with an O- makes no charge", () => {
    const g = graph("CS(=O)[O-]");
    expect(unchargedEnds(g)).toBe(g);
  });

  it("leaves an X+ as drawn where it has no room for one more bond", () => {
    const g = graph("C[P+](=O)(C)(C)[O-]");
    expect(unchargedEnds(g)).toBe(g);
  });

  it("writes P+-O- as P=O, the charges gone, the configuration's neighbours the same", () => {
    const g = graph("C[P@+]([O-])(CCC)c1ccccc1");
    const u = unchargedEnds(g);
    const p = u.atoms.findIndex((a) => a.el === "P");
    expect(u.atoms.map((a) => a.charge ?? 0)).toEqual(u.atoms.map(() => 0));
    expect(u.bonds.find((b) => b.a === p || b.b === p ? u.atoms[b.a === p ? b.b : b.a].el === "O" : false)!.order).toBe(2);
    expect(u.atoms[p].tetra).toEqual(g.atoms[p].tetra);
  });
});

describe("ends that share their bonds", () => {
  it("are written alike, uncharged, their centre carrying how many and their double bonds", () => {
    const s = endsShared(graph("CS(=O)[O-]"));
    expect(s.atoms.map((a) => a.el)).toEqual(["C", "S~2,3", "O^#1", "O^#2"]);
    expect(s.bonds.filter((b) => b.order === SHARED_END)).toHaveLength(2);
    expect(s.atoms.filter((a) => elementOf(a.el) === "O").map((a) => [a.charge, a.hs])).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it("numbered where alike, in the order they come, ends of two elements not; a configuration at a centre of alike ends written with none", () => {
    // (a phosphorothioate anion's O and S: two elements, its P keeps its configuration)
    const thio = endsShared(graph("CO[P@](=S)([O-])OCC"));
    expect(thio.atoms.map((a) => a.el)).toEqual(["C", "O", "P~2,3", "S", "O", "O", "C", "C"]);
    expect(thio.atoms[2].tetra).toBeDefined();
    // (a phosphate diester anion's two O: alike, numbered, its P none)
    const diester = endsShared(graph("CO[P@](=O)([O-])OCC"));
    expect(diester.atoms.map((a) => a.el)).toEqual(["C", "O", "P~2,3", "O^#1", "O^#2", "O", "C", "C"]);
    expect(diester.atoms[2].tetra).toBeUndefined();
  });

  it("are read by the lone-pair rule as drawn: a sulfinate anion's S asked as a centre, as a sulfoxide's is; a P with an =O and an O- and one group not", () => {
    expect(centres("CS(=O)[O-]")).toEqual([1]);
    expect(centres("CS(C)=O")).toEqual([1]);
    expect(centres("CP(=O)[O-]")).toEqual([]);
  });
});

const text = (smiles: string) => identityText(smilesInput(smiles) as never);
const complete = (smiles: string) => identity(smilesInput(smiles) as never).complete;

describe("what the uncharged form takes", () => {
  it("an S+ with an end O- and room for one more bond (a sulfone drawn S+(=O)(O-)) is written S=O: the same identity as the sulfone", () => {
    const g = graph("C[S+](=O)(C)[O-]");
    const u = unchargedEnds(g);
    expect(u).not.toBe(g);
    expect(u.atoms.map((a) => a.charge ?? 0)).toEqual(u.atoms.map(() => 0));
    expect(text("C[S+](=O)(C)[O-]")).toBe(text("CS(C)(=O)=O"));
  });

  it("an Se (or Te) is a centre, and an Se- (Te-) an end chalcogen: a selenoxide and a phosphine selenide, each drawn two ways, one identity", () => {
    expect(text("C[Se+]([O-])C")).toBe(text("C[Se](=O)C"));
    expect(text("C[Te+]([O-])C")).toBe(text("C[Te](=O)C"));
    expect(text("C[P+](C)(C)[Se-]")).toBe(text("CP(C)(C)=[Se]"));
    expect(text("C[P+](C)(C)[Te-]")).toBe(text("CP(C)(C)=[Te]"));
  });
});

describe("what the shared ends take", () => {
  it("an ester oxygen is no end: trimethyl phosphate, with one =O and three OMe, is left as drawn (the same object)", () => {
    const g = graph("COP(=O)(OC)OC");
    expect(endsShared(g)).toBe(g);
  });

  it("a centre with one end is left alone: a phosphine oxide's =O", () => {
    const g = graph("CP(C)(C)=O");
    expect(endsShared(g)).toBe(g);
  });

  it("a sulfone's two =O, alike already, are written as before: the same object", () => {
    const g = graph("CS(C)(=O)=O");
    expect(endsShared(g)).toBe(g);
  });
});

// (each centre's alike ends numbered, the canonical search need not find their swaps one centre after another: found in review)
describe("a structure of several phosphate or sulfate groups still has a complete identity", () => {
  it("phytic acid (inositol hexakisphosphate)", () => {
    expect(complete("OP(O)(=O)OC1C(OP(O)(O)=O)C(OP(O)(O)=O)C(OP(O)(O)=O)C(OP(O)(O)=O)C1OP(O)(O)=O")).toBe(true);
  }, 60_000);
  it("sucrose octasulfate", () => {
    expect(complete("OS(=O)(=O)OCC1OC(OC2(COS(=O)(=O)O)OC(COS(=O)(=O)O)C(OS(=O)(=O)O)C2OS(=O)(=O)O)C(OS(=O)(=O)O)C(OS(=O)(=O)O)C1OS(=O)(=O)O")).toBe(true);
  }, 60_000);
  it("a chain of ten phosphodiester anions whose units differ", () => {
    let s = "O";
    for (let k = 0; k < 10; k++) s += "P(=O)([O-])O" + "C".repeat(k + 2) + (k % 2 ? "(C)" : "");
    expect(complete(s + "O")).toBe(true);
  }, 60_000);
});

describe("the hydrogens of shared ends", () => {
  it("a phosphonic acid's ends (=O, OH, OH) are written three O alike with no hydrogen, the centre carrying the two", () => {
    const s = endsShared(graph("CP(=O)(O)O"));
    const p = s.atoms.findIndex((a) => a.el.startsWith("P"));
    expect(s.atoms[p].el).toContain(",hO2");
    const ends = s.atoms.map((a, i) => ({ a, i })).filter(({ a }) => a.el.startsWith("O"));
    expect(ends).toHaveLength(3);
    for (const { a } of ends) expect([a.hs ?? 0, a.charge ?? 0]).toEqual([0, 0]);
    expect(s.bonds.filter((b) => b.a === p || b.b === p).filter((b) => b.order === SHARED_END)).toHaveLength(3);
  });
});
