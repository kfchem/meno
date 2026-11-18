/**
 * The end chalcogens on P, As, Sb, S, Se and Te as identity compares them (./chalcogenEnds), asked directly: what the uncharged
 * form leaves as drawn, and how the lone-pair rule reads a centre whose ends share their bonds. Identity's known answers are in
 * ./stereo/units.test.ts.
 */
import { describe, expect, it } from "vitest";
import { smilesInput } from "../../layout/smilesInput";
import { chalcogenEnds, endsShared, SHARED_END, unchargedEnds } from "./chalcogenEnds";
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
    expect(s.atoms.map((a) => a.el)).toEqual(["C", "S~2,3", "O", "O"]);
    expect(s.bonds.filter((b) => b.order === SHARED_END)).toHaveLength(2);
    expect(s.atoms.filter((a) => a.el === "O").map((a) => [a.charge, a.hs])).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it("are read by the lone-pair rule as drawn: a sulfinate anion's S asked as a centre, as a sulfoxide's is; a P with an =O and an O- and one group not", () => {
    expect(centres("CS(=O)[O-]")).toEqual([1]);
    expect(centres("CS(C)=O")).toEqual([1]);
    expect(centres("CP(=O)[O-]")).toEqual([]);
  });
});
