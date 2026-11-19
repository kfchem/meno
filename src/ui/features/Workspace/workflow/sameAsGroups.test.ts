/**
 * *Same as* in Enumerate and Substituents reading a template's AND and OR groups (chem/identityOf `withGroups`; found in review).
 */
// PIN (REVIEW, #1293 bb11d5b7): the groups reach Enumerate's *Same as*: the two enantiomers a swapped pair of R groups makes at a wedged centre are one product where the centre is in an AND group, and two where it is drawn absolute; and groups numbered 1 and 2 are two. Put in src/ui/features/Workspace/workflow/ beside enumerate.test.ts.
import { describe, expect, it } from "vitest";
import type { Model } from "../store/types";
import { enumerated } from "./enumerate";
import { substituted } from "./substituents";
import { template } from "./testdata/enumerationCases";
import { identityInputOf, withGroups } from "../chem/identityOf";
import { identity } from "../../../../lib/chem/identity";
import { drawnFromSmiles } from "../chem/testdata/identityCases";

/** `t` with the atoms at `at` (by place) in `group`. */
const grouped = (t: Model, group: Model["atoms"][number]["stereoGroup"], at: readonly number[]): Model => ({ ...t, atoms: t.atoms.map((a, i) => (at.includes(i) ? { ...a, stereoGroup: group } : a)) });
const ran = (t: Model) => {
  const r = enumerated(t, "R1: Me\nEt\nR2: Me\nEt");
  if (!r.ok) throw new Error(r.problems.join("; "));
  return r;
};

describe("groups in Enumerate's Same as (found in review)", () => {
  // (F, a centre with two R groups and a Cl: its R1 = Me, R2 = Et and R1 = Et, R2 = Me are mirror images)
  const t = template("F[C@](*)(*)Cl");

  it("drawn absolute, the pair of enantiomers are two products", () => {
    const r = ran(t);
    expect(r.aside.map((m) => [m.number, m.why])).toEqual([]);
    expect(r.made.map((m) => m.number)).toEqual([1, 2, 3, 4]);
  });

  it("the centre in an AND group: the second of the pair is the first's racemate, aside as Same as 2", () => {
    const r = ran(grouped(t, { kind: "and", n: 1 }, [1]));
    expect(r.aside.map((m) => [m.number, m.why])).toEqual([[3, "Same as 2"]]);
  });

  it("in an OR group likewise: one or the other, either hand", () => {
    const r = ran(grouped(t, { kind: "or", n: 1 }, [1]));
    expect(r.aside.map((m) => [m.number, m.why])).toEqual([[3, "Same as 2"]]);
  });
});

describe("groups numbered, as identity reads a drawing (found in review)", () => {
  it("two AND groups, and1 and and2, are two groups: one AND group of both centres is another structure", () => {
    const m = drawnFromSmiles("C[C@@H](O)[C@H](O)C");
    const two = { ...m, atoms: m.atoms.map((a, i) => (i === 1 ? { ...a, stereoGroup: { kind: "and" as const, n: 1 } } : i === 3 ? { ...a, stereoGroup: { kind: "and" as const, n: 2 } } : a)) };
    const one = { ...m, atoms: m.atoms.map((a, i) => (i === 1 || i === 3 ? { ...a, stereoGroup: { kind: "and" as const, n: 1 } } : a)) };
    const text = (x: Model) => identity(withGroups(identityInputOf(x).input, x)).text;
    expect(text(two)).not.toBe(text(one));
    expect(withGroups(identityInputOf(two).input, two).groups).toHaveLength(2);
    expect(withGroups(identityInputOf(one).input, one).groups).toHaveLength(1);
  });
});

describe("groups in Substituents' Same as (found in review)", () => {
  // (a meso butane-2,3-diol: a Cl on one methyl or on the other makes mirror images)
  const meso = drawnFromSmiles("C[C@@H](O)[C@@H](O)C");
  const run = (t: Model) => {
    const r = substituted(t, [1, 6], "Cl", "one");
    if (!r.ok) throw new Error(r.problems.join("; "));
    return r;
  };

  it("drawn absolute, the two mirror images are two products", () => {
    expect(run(meso).aside.map((m) => [m.number, m.why])).toEqual([]);
  });

  it("both centres in one AND group: the second is the first's racemate, aside as Same as 1", () => {
    const r = run(grouped(meso, { kind: "and", n: 1 }, [1, 3]));
    expect(r.aside.map((m) => [m.number, m.why])).toEqual([[2, "Same as 1"]]);
  });
});

describe("a group with no number is group 1 (found in review)", () => {
  it("an AND group drawn with no number and one numbered 1 are one group", () => {
    const m = drawnFromSmiles("C[C@@H](O)[C@H](O)C");
    const mixed = { ...m, atoms: m.atoms.map((a, i) => (i === 1 ? { ...a, stereoGroup: { kind: "and" as const } } : i === 3 ? { ...a, stereoGroup: { kind: "and" as const, n: 1 } } : a)) };
    expect(withGroups(identityInputOf(mixed).input, mixed).groups).toEqual([{ kind: "and", atoms: [1, 3] }]);
  });
});
