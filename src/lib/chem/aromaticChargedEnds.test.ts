import { describe, expect, it } from "vitest";
import { smilesInput } from "../layout/smilesInput";
import { identity } from "./identity";

/**
 * Which end of a centre of bonds marked aromatic outside a ring takes its double bond (perception/kekule; docs/EDITOR-2D.md). An atom
 * whose H is stated - [NH2+], [OH+] - has its valence fixed by what is written, so it takes the double where room is left. Where ends
 * tie, the double goes to O first, then S and Se, then N, then C: an amide is the amide, a thioamide C=S, a urea C=O. Between two of one
 * element, an amidine's two N, by rank, the same whichever way it is written. Each read is checked by its identity against the
 * structure written out (found in review).
 */
const id = (s: string) => identity(smilesInput(s) as unknown as Parameters<typeof identity>[0]).text;

describe("a bond marked aromatic outside a ring to an atom with its H stated", () => {
  it("leaves an acetate and a nitro as they are: a negative charge on the atom that takes no double", () => {
    expect(id("CC(:O):[O-]")).toBe(id("CC(=O)[O-]"));
    expect(id("C[N+](:O):[O-]")).toBe(id("C[N+](=O)[O-]"));
    expect(id("CC(:O):[NH-]")).toBe(id("CC(=O)[NH-]"));
    expect(id("[NH3+]C(:O):O")).toBe(id("[NH3+]C(=O)O"));
  });

  it("gives the double bond to the [NH2+] of an amidinium and a guanidinium, in either order written", () => {
    expect(id("CC(:N):[NH2+]")).toBe(id("CC(N)=[NH2+]"));
    expect(id("CC(:[NH2+]):N")).toBe(id("CC(N)=[NH2+]"));
    expect(id("NC(:N):[NH2+]")).toBe(id("NC(N)=[NH2+]"));
  });

  it("gives it to the [OH+] of a protonated acid", () => {
    expect(id("CC(:O):[OH+]")).toBe(id("CC(O)=[OH+]"));
  });
});

describe("ends that tie for the one double bond a centre needs", () => {
  it("give it to O first: an amide, a urea, a carbamic acid and carbonic acid, in either order written", () => {
    expect(id("CC(:O):N")).toBe(id("CC(N)=O"));
    expect(id("CC(:N):O")).toBe(id("CC(N)=O"));
    expect(id("CC(:O):NC")).toBe(id("CC(=O)NC"));
    expect(id("c1ccccc1C(:O):N")).toBe(id("c1ccccc1C(N)=O"));
    expect(id("NC(:O):N")).toBe(id("NC(N)=O"));
    expect(id("NC(:O):O")).toBe(id("NC(=O)O"));
    expect(id("C(:O)(:O):O")).toBe(id("OC(=O)O"));
    expect(id("CC(:O):N(C)C")).toBe(id("CC(=O)N(C)C"));
  });

  it("then S: a thioamide is C=S, a thio acid C=O with its SH", () => {
    expect(id("CC(:S):N")).toBe(id("CC(N)=S"));
    expect(id("CC(:N):S")).toBe(id("CC(N)=S"));
    expect(id("CC(:O):S")).toBe(id("CC(S)=O"));
  });

  it("between two N, an amidine's, by rank: one identity whichever way it is written", () => {
    expect(id("CC(:N):NC")).toBe(id("CC(:NC):N"));
  });

  it("gives none to a centre with a double bond already: a lone such bond to it has no form, and is refused", () => {
    expect(() => smilesInput("C=C(C):O")).toThrow(/marked aromatic outside a ring \(atoms 2 and 4\)/);
  });
});
