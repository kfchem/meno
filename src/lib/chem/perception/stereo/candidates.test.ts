/**
 * Meno's candidates by shape (./candidates; foundation part 13, C, as the chemistry check ruled them): each known answer as the
 * kinds and places found, and for a place that is none, why not.
 */
import { describe, expect, it } from "vitest";
import { smilesInput } from "../../../layout/smilesInput";
import type { SymmetryInput } from "../symmetry";
import { CANDIDATE_WHY, candidates, NOT_CANDIDATE, notCandidate } from "./candidates";
import { MOVING_CN } from "./movingCN";

const graph = (smiles: string) => smilesInput(smiles) as unknown as SymmetryInput;
/** The candidates of a SMILES, each as its kind and its atom (a centre), its bond's two atoms (a double bond) or its run's ends. */
const found = (smiles: string) => {
  const g = graph(smiles);
  return candidates(g).map((c) =>
    c.kind === "centre" ? `centre ${c.at}` : c.kind === "bond" ? `bond ${g.bonds[c.at].a}-${g.bonds[c.at].b}` : c.kind === "biaryl" ? "biaryl" : `${c.kind} ${c.ends.join("-")}`,
  );
};
const whyNotCentre = (smiles: string, at: number) => notCandidate(graph(smiles), { kind: "centre", at });
const whyNotBond = (smiles: string, a: number, b: number) => {
  const g = graph(smiles);
  return notCandidate(g, { kind: "bond", at: g.bonds.findIndex((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)) });
};

describe("centres of four groups", () => {
  it("an atom of four groups, at most one a hydrogen, whatever is alike round it: butan-2-ol's C2, propan-2-ol's too", () => {
    expect(found("CC(O)CC")).toEqual(["centre 1"]);
    expect(found("CC(O)C")).toEqual(["centre 1"]);
    expect(candidates(graph("CC(O)CC"))[0].why).toBe(CANDIDATE_WHY.four);
  });

  it("B, Si, Ge, Sn, Pb, N+, P+, As+ and S of four groups are candidates, P+ with an H among them", () => {
    expect(found("C[Si](Cl)(CC)c1ccccc1")).toContain("centre 1");
    expect(found("C[Sn](Cl)(CC)c1ccccc1")).toContain("centre 1");
    expect(found("C[N+](CC)(CCC)c1ccccc1")).toContain("centre 1");
    expect(found("C[PH+](CC)c1ccccc1")).toContain("centre 1");
  });

  it("is none with two hydrogens, as a metal, as an N+ with an H, or with more than four groups - each said", () => {
    expect(whyNotCentre("ClCCl", 1)).toBe(NOT_CANDIDATE.hydrogens);
    expect(whyNotCentre("Cl[Pt](Cl)(N)N", 1)).toBe(NOT_CANDIDATE.metal);
    expect(whyNotCentre("C[Al](C)(C)Cl", 1)).toBe(NOT_CANDIDATE.metal);
    expect(whyNotCentre("C[NH+](CC)CCC", 1)).toBe(NOT_CANDIDATE.ammonium);
    expect(whyNotCentre("CP(C)(C)(C)C", 1)).toBe(NOT_CANDIDATE.many(5));
    expect(whyNotCentre("CC", 0)).toBe(NOT_CANDIDATE.hydrogens);
  });
});

describe("centres of three groups and a lone pair", () => {
  it("a sulfoxide's S and a phosphine's P are candidates; an amine's N is none, said as the reader says it", () => {
    expect(found("CS(=O)CC")).toEqual(["centre 1"]);
    expect(candidates(graph("CS(=O)CC"))[0].why).toBe(CANDIDATE_WHY.lonePair);
    expect(found("CP(CC)c1ccccc1")).toContain("centre 1");
    expect(whyNotCentre("CN(CC)CCC", 1)).toBe(NOT_CANDIDATE.three);
  });

  it("a secondary phosphine's P with its H among its three is a candidate (the maintainer's ruling, 2026-11-06); an N's or an S+'s with an H none", () => {
    expect(found("C[PH]c1ccccc1")).toContain("centre 1");
    expect(whyNotCentre("C[NH]CC", 1)).toBe(NOT_CANDIDATE.three);
    expect(whyNotCentre("C[SH+]CC", 1)).toBe(NOT_CANDIDATE.three);
  });
});

describe("double bonds", () => {
  it("one with a group on each end is a candidate: but-2-ene's", () => {
    expect(found("CC=CC")).toEqual(["bond 1-2"]);
  });

  it("is none with nothing but hydrogens on an end, in a ring of seven or fewer, or a C=N whose E/Z is none of its own", () => {
    expect(whyNotBond("CC(C)=C", 1, 3)).toBe(NOT_CANDIDATE.bare);
    expect(whyNotBond("C1CC=CCC1", 2, 3)).toBe(NOT_CANDIDATE.ring);
    expect(whyNotBond("C1CCCC=CCC1", 4, 5)).toBeNull();
    expect(whyNotBond("CC(N)=NC", 1, 3)).toBe(NOT_CANDIDATE.moving(MOVING_CN.shift));
    expect(found("CC(CC)=NC")).toEqual(["bond 1-4"]);
  });
});

describe("runs of cumulated double bonds", () => {
  it("between two carbons each with a group: even an axis, odd a cis or trans; an N end none (Meno's cautious rule)", () => {
    expect(found("CC=C=CC")).toEqual(["axis 1-3"]);
    expect(found("CC=C=C=CC")).toEqual(["cumulated 1-4"]);
    expect(found("CC=C=NC")).toEqual([]);
    expect(whyNotBond("CC=C=NC", 2, 3)).toBe(NOT_CANDIDATE.runNotCarbon);
    expect(whyNotBond("CC=C=C", 2, 3)).toBe(NOT_CANDIDATE.runEnd);
  });
});

describe("an axis of hindered rotation", () => {
  it("is a candidate only where the drawing states one: a biaryl with four ortho groups drawn with none has none", () => {
    expect(found("Cc1cccc(C)c1-c1c(C)cccc1C")).toEqual([]);
    const g = graph("Cc1cccc(C)c1-c1c(C)cccc1C");
    // (the bond between the rings: a single bond whose two atoms each have three neighbours)
    const degree = (i: number) => g.bonds.filter((b) => b.a === i || b.b === i).length;
    const at = g.bonds.find((b) => b.order === 1 && degree(b.a) === 3 && degree(b.b) === 3)!;
    expect(candidates({ ...g, axes: [{ atoms: [at.a, at.b], refs: [0, 9], sense: 1 }] }).map((c) => c.kind)).toEqual(["biaryl"]);
  });

  it("an allene's axis drawn is the run's, listed once", () => {
    const g = graph("CC=C=CC");
    expect(candidates({ ...g, axes: [{ atoms: [1, 3], refs: [0, 4], sense: 1 }] }).map((c) => c.kind)).toEqual(["axis"]);
  });
});
