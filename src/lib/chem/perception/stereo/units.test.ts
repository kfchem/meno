/**
 * Identity's fill in the core (./units, part 13's move): the same answers as before it moved; and, since U2, the end chalcogens on
 * P, As, Sb, S, Se and Te written as one form whichever is drawn double or charged (../chalcogenEnds), by the chemistry check's known
 * answers.
 */
import { describe, expect, it } from "vitest";
import { smilesInput } from "../../../layout/smilesInput";
import { filledIn as filledInIdentity, identity } from "../../identity";
import { CHELATE_RING as fromChelateRing } from "../../chelateRing";
import { blanksOf, CHELATE_RING, filledIn } from "./units";

const id = (smiles: string) => identity(smilesInput(smiles) as unknown as Parameters<typeof identity>[0]).text;

describe("identity's fill, moved into the core", () => {
  it("is the one identity imports and the one the chelate ring's number comes from", () => {
    expect(filledInIdentity).toBe(filledIn);
    expect(fromChelateRing).toBe(CHELATE_RING);
  });

  it("fills what sets nothing as before: propan-2-ol written with its CH either way, and not, is one", () => {
    expect(new Set([id("C[C@H](O)C"), id("C[C@@H](O)C"), id("CC(O)C")]).size).toBe(1);
  });

  it("takes a ring's double bond as able to carry cis or trans from eight atoms: cyclooctene's (trans-cyclooctene is made), not cycloheptene's", () => {
    const bonds = (smiles: string) => blanksOf(smilesInput(smiles) as unknown as Parameters<typeof blanksOf>[0]).filter((b) => b.kind === "bond").length;
    expect([bonds("C1=CCCCCC1"), bonds("C1=CCCCCCC1")]).toEqual([0, 1]);
  });
});

describe("end chalcogens on P, As, Sb, S, Se, Te: one form whichever is drawn double or charged (U2; perception/chalcogenEnds)", () => {
  const one = (...smiles: string[]) => expect(new Set(smiles.map(id)).size).toBe(1);
  const apart = (...smiles: string[]) => expect(new Set(smiles.map(id)).size).toBe(smiles.length);

  it("a phosphate diester anion's P is no centre: written either way, not written, its charge on either oxygen or drawn P+ with two O-, one identity", () => {
    one("CCO[P@](=O)([O-])OC", "CCO[P@@](=O)([O-])OC", "CCOP(=O)([O-])OC", "CCOP([O-])(=O)OC", "CCO[P+]([O-])([O-])OC", "[O-]P(=O)(OC)OCC");
  });

  it("the neutral triester with three unlike groups is a centre: two identities", () => {
    apart("CCO[P@](=O)(OC)OC(C)C", "CCO[P@@](=O)(OC)OC(C)C");
  });

  it("a phosphinic acid's P, its O-H against its =O, is no centre: one identity - not its anion's", () => {
    one("C[P@](=O)(O)c1ccccc1", "C[P@@](=O)(O)c1ccccc1", "CP(=O)(O)c1ccccc1");
    apart("CP(=O)(O)c1ccccc1", "CP(=O)([O-])c1ccccc1");
  });

  it("a phosphinate ester and a phosphonate with two unlike esters stay centres", () => {
    apart("C[P@](=O)(OC)c1ccccc1", "C[P@@](=O)(OC)c1ccccc1");
    apart("C[P@](=O)(OC)OCC", "C[P@@](=O)(OC)OCC");
  });

  it("a thio acid drawn P(=S)(O-H) and drawn P(=O)(S-H) stays two tautomers, each a centre: no hydrogen shared across elements", () => {
    apart("CP(=S)(O)c1ccccc1", "CP(=O)(S)c1ccccc1");
    apart("C[P@](=S)(O)c1ccccc1", "C[P@@](=S)(O)c1ccccc1");
  });

  it("a phosphorothioate anion with its charge on O or on S is one identity, its P still a centre: O and S two elements", () => {
    // (the same neighbours in the same turn: S then O in the first, O then S in the second - so @ against @@)
    one("CCO[P@](=S)([O-])OC", "CCO[P@@](=O)([S-])OC");
    apart("CCO[P@](=S)([O-])OC", "CCO[P@@](=S)([O-])OC");
  });

  it("an 18O keeps the two oxygens apart - its P a centre - and its charge on either is one identity", () => {
    // (the SMILES reader keeps no mass number: the 18O given as identity reads one, atom 4)
    const labelled = (smiles: string) => {
      const g = smilesInput(smiles) as unknown as Parameters<typeof identity>[0];
      return identity({ ...g, atoms: g.atoms.map((a, i) => (i === 4 ? { ...a, isotope: 18 } : a)) }).text;
    };
    expect(labelled("CCO[P@](=O)([O-])OC")).not.toBe(labelled("CCO[P@@](=O)([O-])OC"));
    // (atom 4 the 18O in both, drawn =O in the first and O- in the second: the same neighbours in the same turn)
    expect(labelled("CCO[P@](=O)([O-])OC")).toBe(labelled("CCO[P@]([O-])(=O)OC"));
  });

  it("a phosphine oxide drawn R3P=O and R3P+-O- is one identity; a sulfoxide drawn S=O and S+-O- too", () => {
    one("O=P(c1ccccc1)(c1ccccc1)c1ccccc1", "[O-][P+](c1ccccc1)(c1ccccc1)c1ccccc1");
    one("CS(C)=O", "C[S+](C)[O-]");
  });

  it("a P-chiral phosphine oxide keeps its configuration in the uncharged form: each drawing of one hand one identity, the hands two", () => {
    one("C[P@](=O)(CCC)c1ccccc1", "C[P@+]([O-])(CCC)c1ccccc1");
    one("C[P@@](=O)(CCC)c1ccccc1", "C[P@@+]([O-])(CCC)c1ccccc1");
    apart("C[P@](=O)(CCC)c1ccccc1", "C[P@@](=O)(CCC)c1ccccc1");
  });

  it("a sulfoxide is a unit, drawn either way; a sulfinate ester a unit; a sulfinate anion and a sulfinic acid none", () => {
    one("C[S@](=O)CC", "C[S@+]([O-])CC");
    apart("C[S@](=O)CC", "C[S@@](=O)CC");
    apart("C[S@](=O)OC", "C[S@@](=O)OC");
    one("C[S@](=O)[O-]", "C[S@@](=O)[O-]", "CS(=O)[O-]");
    one("C[S@](=O)O", "C[S@@](=O)O", "CS(=O)O");
  });

  it("never at N: an amine N-oxide and a nitro group keep their charges, told from a drawing with N=O", () => {
    apart("C[N+](C)(C)[O-]", "CN(C)(C)=O");
    apart("C[N+](=O)[O-]", "CN(=O)=O");
  });

  it("an iminophosphorane drawn P=N-R and drawn P+-N(-)-R is one identity", () => {
    one("CN=P(c1ccccc1)(c1ccccc1)c1ccccc1", "C[N-][P+](c1ccccc1)(c1ccccc1)c1ccccc1");
  });

  it("a P+ with an O- and an N(-)-R on it is left as drawn, whichever atom comes first: the choice would follow their order", () => {
    one("C[P+](C)([O-])[N-]C", "C[N-][P+](C)(C)[O-]", "[O-][P+](C)(C)[N-]C");
  });

  it("the same whatever order the atoms come in", () => {
    one("CCOP(=O)([O-])OC", "COP([O-])(=O)OCC", "[O-]P(OCC)(OC)=O");
    one("CS(=O)(=O)[O-]", "[O-]S(C)(=O)=O", "O=S(=O)([O-])C");
  });
});
