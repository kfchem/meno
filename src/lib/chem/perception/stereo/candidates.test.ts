/**
 * Meno's candidates by shape (./candidates; foundation part 13, C, as the chemistry check ruled them): each known answer as the
 * kinds and places found, and for a place that is none, why not.
 */
import { describe, expect, it } from "vitest";
import { smilesInput } from "../../../layout/smilesInput";
import type { SymmetryInput } from "../symmetry";
import { CANDIDATE_WHY, candidates, NOT_CANDIDATE, notCandidate } from "./candidates";
import { MOVING_CN } from "./movingCN";
import { blanksOf } from "./units";

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

// (the rules' edges: found in review)
describe("edges of the candidates", () => {
  it("an element of no configuration of four groups - an iodine with four - is none, said", () => {
    expect(found("C[I](C)(C)C")).toEqual([]);
    expect(notCandidate(graph("C[I](C)(C)C"), { kind: "centre", at: 1 })).toBe(NOT_CANDIDATE.element);
  });

  it("a primary phosphine's P - one group and two hydrogens - is none: only one H is allowed among three", () => {
    expect(found("C[PH2]")).toEqual([]);
    expect(found("C[PH]C")).toEqual(["centre 1"]);
  });

  it("a triple bond is no candidate; a cycloheptene's double bond (a ring of seven) is none, a cyclooctene's is one", () => {
    expect(found("CC#CC")).toEqual([]);
    expect(found("C1CCC=CCC1")).toEqual([]);
    expect(found("C1CCCC=CCC1")).toEqual(["bond 4-5"]);
  });

  it("a lead, a bismuth and a tellurium centre are candidates (the list is the text's)", () => {
    expect(found("C[Pb](C)(CC)Cl")).toEqual(["centre 1"]);
    expect(found("C[Bi](C)CC")).toEqual(["centre 1"]);
    expect(found("C[Te](=O)C")).toEqual(["centre 1"]);
  });
});

describe("words and places at the rules' edges", () => {
  it("a triple bond asked of: 'no double bond' (the run's words are for a bond of a run)", () => {
    const g = graph("CC#CC");
    const k = g.bonds.findIndex((b) => b.order === 3);
    expect(notCandidate(g, { kind: "bond", at: k })).toBe(NOT_CANDIDATE.notDouble);
  });

  it("a secondary phosphine's centre: its neighbours are the two groups, then the H (-1), as a four-group centre's", () => {
    const [b] = blanksOf(graph("C[PH]CC"));
    expect(b).toMatchObject({ kind: "centre", at: 1, neighbours: [0, 2, -1] });
    const [q] = blanksOf(graph("C[SiH](CC)CCC"));
    expect(q).toMatchObject({ kind: "centre", neighbours: [0, 2, 4, -1] });
  });

  it("a quaternary ammonium of four unlike groups is a centre; an N+ with an H among its four is not", () => {
    expect(notCandidate(graph("[N+](C)(CC)(CCC)c1ccccc1"), { kind: "centre", at: 0 })).toBeNull();
    expect(notCandidate(graph("[NH+](C)(CC)CCC"), { kind: "centre", at: 0 })).toBe(NOT_CANDIDATE.ammonium);
  });
});

describe("a sulfinyl H, R-S(=O)-H, keeps no configuration (the chemistry check's ruling)", () => {
  it("CS=O, its S(IV) carrying an H (the one count), is no centre and no place left open: its H moves to O, the sulfenic acid", () => {
    const g = smilesInput("CS=O") as unknown as SymmetryInput;
    expect(g.atoms[1].hs).toBe(1);
    expect(candidates(g).filter((c) => c.kind === "centre")).toEqual([]);
    expect(notCandidate(g, { kind: "centre", at: 1 })).toBe(NOT_CANDIDATE.three);
  });
});

describe("a double bond's ends: trigonal-planar, or no cis or trans", () => {
  it("takes no double bond to an ylide's S or P, or to a sulfoximine's or a sulfilimine's S: their ends' groups do not lie in one plane", () => {
    // (a sulfonium ylide, CH3CH=S(CH3)CH2CH3: its S three groups and a lone pair - a centre, its 'double bond' no cis or trans)
    expect(found("CC=S(C)CC")).toEqual(["centre 2"]);
    expect(whyNotBond("CC=S(C)CC", 1, 2)).toBe(NOT_CANDIDATE.notTrigonal);
    // (a sulfilimine, its S three groups and a lone pair; a sulfoximine charge-separated, its S four; a phosphorus ylide's P, four)
    expect(found("CS(CC)=NC")).toEqual(["centre 1"]);
    expect(whyNotBond("CS(CC)=NC", 1, 4)).toBe(NOT_CANDIDATE.notTrigonal);
    expect(found("C[S+]([O-])(CC)=NC")).toEqual(["centre 1"]);
    expect(whyNotBond("C[S+]([O-])(CC)=NC", 1, 5)).toBe(NOT_CANDIDATE.notTrigonal);
    expect(whyNotBond("CC=P(C)(C)CC", 1, 2)).toBe(NOT_CANDIDATE.notTrigonal);
    // (and none of them a blank to be filled either way)
    for (const s of ["CC=S(C)CC", "CS(CC)=NC", "C[S+]([O-])(CC)=NC", "CC=P(C)(C)CC"]) expect(blanksOf(graph(s)).filter((b) => b.kind === "bond"), s).toEqual([]);
  });

  it("keeps one whose ends are trigonal-planar: a sulfine's S (two groups and a lone pair), a silene's Si (three and none)", () => {
    expect(found("CC=[S+][O-]")).toEqual(["bond 1-2"]);
    expect(found("CC=[Si](C)CC")).toEqual(["bond 1-2"]);
  });
});

describe("what a run goes on through: the readers' rule, a C or an N+", () => {
  it("offers no axis through an S, a P+ or a B- between two double bonds - no reader reads one there - nor asks one filled", () => {
    for (const s of ["FC=S=CF", "CC(F)=S=C(F)C", "FC=[P+]=CF", "FC=[B-]=CF"]) {
      expect(found(s), s).toEqual([]);
      expect(blanksOf(graph(s)).filter((b) => b.kind === "axis" || b.kind === "cumulated"), s).toEqual([]);
    }
  });

  it("keeps the axis of an allene, of a run of four double bonds and of an N+ in the middle, as a candidate and as a blank", () => {
    for (const [s, axis] of [
      ["FC=C=CF", "axis 1-3"],
      ["FC=C=C=C=CF", "axis 1-5"],
      ["FC=[N+]=CF", "axis 1-3"],
    ]) {
      expect(found(s), s).toEqual([axis]);
      expect(blanksOf(graph(s)).filter((b) => b.kind === "axis").map((b) => ("ends" in b ? b.ends.join("-") : "")), s).toEqual([axis.slice(5)]);
    }
  });
});
